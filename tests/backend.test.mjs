import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCredentialStore } from "../src/main/credentials.ts";
import { isTrustedRendererUrl, externalHttpUrl } from "../src/main/security.ts";
import {
  fetchJsonWithTimeout,
  REQUEST_TIMEOUT_MESSAGE,
} from "../src/main/request.ts";

function fakeStorage(overrides = {}) {
  return {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`),
    decryptStringAsync: async (value) => ({
      result: value.toString().slice("encrypted:".length),
      shouldReEncrypt: false,
    }),
    ...overrides,
  };
}

async function temporaryKey(t) {
  const directory = await mkdtemp(join(tmpdir(), "study-desk-credentials-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { path: join(directory, "key.bin"), directory };
}

test("a saved key is unwrapped into a string and used in the Authorization header", async (t) => {
  const { path } = await temporaryKey(t);
  const store = createCredentialStore(path, fakeStorage(), "win32");
  await store.saveKey("test-key-only");
  const key = await store.readKey();
  assert.equal(key, "test-key-only");
  await fetchJsonWithTimeout(
    "https://example.invalid",
    { headers: { Authorization: `Bearer ${key}` } },
    1000,
    async (_, options) => {
      assert.equal(options.headers.Authorization, "Bearer test-key-only");
      return Response.json({ choices: [] });
    },
  );
  await store.clearKey();
  assert.equal(await store.readKey(), "");
  await store.clearKey();
});

test("keys flagged for rotation are re-encrypted and temporary files are cleaned up", async (t) => {
  const { path, directory } = await temporaryKey(t);
  let generation = 0;
  const store = createCredentialStore(
    path,
    fakeStorage({
      encryptStringAsync: async (value) =>
        Buffer.from(`${++generation}:${value}`),
      decryptStringAsync: async () => ({
        result: "test-key-only",
        shouldReEncrypt: generation === 1,
      }),
    }),
    "win32",
  );
  await store.saveKey("test-key-only");
  assert.equal(await store.readKey(), "test-key-only");
  assert.equal((await readFile(path)).toString(), "2:test-key-only");
  assert.deepEqual(await readdir(directory), ["key.bin"]);
});

test("unavailable asynchronous encryption refuses both persistence and key use", async (t) => {
  const { path, directory } = await temporaryKey(t);
  const store = createCredentialStore(
    path,
    fakeStorage({ isAsyncEncryptionAvailable: async () => false }),
    "win32",
  );
  assert.equal(await store.isAvailable(), false);
  assert.equal(await store.readKey(), "");
  await assert.rejects(
    store.saveKey("test-key-only"),
    /Secure storage is unavailable/,
  );
  assert.deepEqual(await readdir(directory), []);
});

test("Linux plaintext and unknown backends are refused; known secret stores are accepted", async (t) => {
  const { path, directory } = await temporaryKey(t);
  for (const backend of ["basic_text", "unknown", "unexpected-backend"]) {
    const store = createCredentialStore(
      path,
      fakeStorage({ getSelectedStorageBackend: () => backend }),
      "linux",
    );
    assert.equal(await store.isAvailable(), false);
    await assert.rejects(
      store.saveKey("test-key-only"),
      /Secure storage is unavailable/,
    );
    assert.equal(await store.readKey(), "");
  }
  assert.deepEqual(await readdir(directory), []);
  for (const backend of [
    "gnome_libsecret",
    "kwallet",
    "kwallet5",
    "kwallet6",
  ]) {
    assert.equal(
      await createCredentialStore(
        path,
        fakeStorage({ getSelectedStorageBackend: () => backend }),
        "linux",
      ).isAvailable(),
      true,
    );
  }
});

test("failed encryption preserves the previously saved key", async (t) => {
  const { path } = await temporaryKey(t);
  const storage = fakeStorage();
  const store = createCredentialStore(path, storage, "win32");
  await store.saveKey("previous-test-key");
  storage.encryptStringAsync = async () => {
    throw new Error("Unavailable");
  };
  await assert.rejects(store.saveKey("replacement-test-key"), /Unavailable/);
  assert.equal(await store.readKey(), "previous-test-key");
});

test("IPC URL checks reject arbitrary local pages and misleading development URL prefixes", () => {
  const development = "http://localhost:5173/";
  assert.equal(isTrustedRendererUrl(development, development), true);
  assert.equal(isTrustedRendererUrl(`${development}#desk`, development), true);
  for (const candidate of [
    "http://localhost:5173.attacker.invalid/",
    "http://localhost:51730/",
    "http://localhost:5173/untrusted.html",
    "http://user@localhost:5173/",
    "https://localhost:5173/",
    "file:///D:/untrusted.html",
    "about:blank",
    "blob:http://localhost:5173/untrusted",
    "invalid",
  ]) {
    assert.equal(
      isTrustedRendererUrl(candidate, development),
      false,
      candidate,
    );
  }
  const production = "file:///D:/StudyDesk/out/renderer/index.html";
  assert.equal(isTrustedRendererUrl(production, production), true);
  assert.equal(
    isTrustedRendererUrl("file:///D:/Downloads/untrusted.html", production),
    false,
  );
  assert.equal(
    isTrustedRendererUrl("http://localhost:5173/", production),
    false,
  );
});

test("external links only allow web URLs without embedded credentials", () => {
  assert.equal(
    externalHttpUrl("https://example.com/learn?q=math#steps"),
    "https://example.com/learn?q=math#steps",
  );
  assert.equal(externalHttpUrl("http://example.com"), "http://example.com/");
  for (const invalid of [
    "javascript:alert(1)",
    "file:///C:/Windows",
    "data:text/html,hello",
    "mailto:user@example.com",
    "https://user:password@example.com",
    "relative/path",
    null,
    "https://example.com/" + "x".repeat(4096),
  ]) {
    assert.throws(() => externalHttpUrl(invalid), /cannot be opened/);
  }
});

test("a stalled initial response times out and aborts the HTTP request", async () => {
  let signal;
  await assert.rejects(
    fetchJsonWithTimeout(
      "https://example.invalid",
      {},
      15,
      async (_, options) => {
        signal = options.signal;
        return await new Promise(() => {});
      },
    ),
    { message: REQUEST_TIMEOUT_MESSAGE },
  );
  assert.equal(signal.aborted, true);
});

test("the same deadline covers a response body that never finishes", async () => {
  let signal;
  await assert.rejects(
    fetchJsonWithTimeout(
      "https://example.invalid",
      {},
      15,
      async (_, options) => {
        signal = options.signal;
        return { json: () => new Promise(() => {}) };
      },
    ),
    { message: REQUEST_TIMEOUT_MESSAGE },
  );
  assert.equal(signal.aborted, true);
});

test("HTTP error bodies survive parsing and successful requests cancel their deadline", async () => {
  let signal;
  const { response, payload } = await fetchJsonWithTimeout(
    "https://example.invalid",
    {},
    25,
    async (_, options) => {
      signal = options.signal;
      return Response.json(
        { error: { message: "Rate limit reached" } },
        { status: 429 },
      );
    },
  );
  assert.equal(response.status, 429);
  assert.equal(payload.error.message, "Rate limit reached");
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(signal.aborted, false);
});
