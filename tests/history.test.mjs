import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
  rmdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHistoryStore } from "../src/main/history.ts";

const crop = "data:image/png;base64,aGVsbG8=";
const question = (text = "Solve 3x + 4 = 19") => ({
  question: text,
  answer: "**Answer:** $x = 5$",
  model: "test-model",
  imageDataUrl: crop,
});
async function temporaryHistory(t, limits) {
  const directory = await mkdtemp(join(tmpdir(), "study-desk-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "history.json");
  return { directory, path, store: createHistoryStore(path, limits) };
}

test("history persists questions, answers, crops, and timestamps across store instances", async (t) => {
  const { directory, path, store } = await temporaryHistory(t);
  assert.deepEqual(await store.list(), []);
  const id = await store.save({ ...question(), apiKey: "must-not-be-saved" });
  const reopened = createHistoryStore(path);
  const entry = await reopened.get(id);
  assert.deepEqual(
    {
      question: entry.question,
      answer: entry.answer,
      model: entry.model,
      imageDataUrl: entry.imageDataUrl,
    },
    question(),
  );
  assert.ok(Number.isFinite(Date.parse(entry.createdAt)));
  const [summary] = await reopened.list();
  assert.equal(summary.id, id);
  assert.equal(summary.hasImage, true);
  assert.equal(summary.preview, "Answer: x = 5");
  assert.equal(summary.imageDataUrl, undefined);
  assert.equal(summary.answer, undefined);
  assert.equal(
    (await readFile(path, "utf8")).includes("must-not-be-saved"),
    false,
  );
  assert.deepEqual(await readdir(directory), ["history.json"]);
});

test("overlapping save, delete, and clear calls do not lose or resurrect entries", async (t) => {
  const { store } = await temporaryHistory(t);
  const first = await store.save(question("First"));
  const [second] = await Promise.all([
    store.save(question("Second")),
    store.delete(first),
  ]);
  assert.deepEqual(
    (await store.list()).map((entry) => entry.id),
    [second],
  );
  const [, third] = await Promise.all([
    store.clear(),
    store.save(question("Third")),
  ]);
  assert.deepEqual(
    (await store.list()).map((entry) => entry.id),
    [third],
  );
  assert.equal(await store.get(first), null);
  await store.delete(first);
  assert.equal((await store.list()).length, 1);
  await store.clear();
  assert.deepEqual(await store.list(), []);
});

test("history retains newest entries within the count and serialized-byte limits", async (t) => {
  const count = await temporaryHistory(t, { maxEntries: 2 });
  await count.store.save(question("Oldest"));
  await count.store.save(question("Middle"));
  await count.store.save(question("Newest"));
  assert.deepEqual(
    (await count.store.list()).map((entry) => entry.question),
    ["Newest", "Middle"],
  );
  const bytes = await temporaryHistory(t, { maxBytes: 900 });
  await bytes.store.save({ ...question("First"), answer: "a".repeat(350) });
  await bytes.store.save({ ...question("Second"), answer: "b".repeat(350) });
  assert.deepEqual(
    (await bytes.store.list()).map((entry) => entry.question),
    ["Second"],
  );
  assert.ok((await readFile(bytes.path)).length <= 900);
  await assert.rejects(
    bytes.store.save({ ...question(), answer: "x".repeat(2000) }),
    /too large/,
  );
  assert.deepEqual(
    (await bytes.store.list()).map((entry) => entry.question),
    ["Second"],
  );
});

test("unreadable history is preserved until the user explicitly clears it", async (t) => {
  const { path, store } = await temporaryHistory(t);
  for (const broken of [
    "{broken",
    '{"version":2,"entries":[]}',
    '{"version":1,"entries":[{}]}',
  ]) {
    await writeFile(path, broken);
    await assert.rejects(store.list(), /could not be read/);
    await assert.rejects(store.save(question()), /could not be read/);
    assert.equal(await readFile(path, "utf8"), broken);
    await store.clear();
    assert.deepEqual(await store.list(), []);
  }
  await store.save(question());
  assert.equal((await store.list()).length, 1);
});

test("failed writes clean up temporary files and do not poison the operation queue", async (t) => {
  const { directory, path, store } = await temporaryHistory(t);
  await mkdir(path);
  await assert.rejects(store.clear());
  assert.deepEqual(await readdir(directory), ["history.json"]);
  await rmdir(path);
  await store.save(question());
  assert.equal((await store.list()).length, 1);
});
