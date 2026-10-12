const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow } = require("electron");

const directory = process.env.STUDY_DESK_SMOKE_DIR;
if (!directory)
  throw new Error("Run this smoke test through npm run test:electron.");
app.setPath("userData", directory);
app.disableHardwareAcceleration();
app.on("browser-window-created", (_, window) => {
  window.hide();
  window.setSkipTaskbar(true);
});

let authorization;
global.fetch = async (_, options) => {
  authorization = options.headers.Authorization;
  return Response.json({
    model: "fake-smoke-model",
    choices: [{ message: { content: "A smoke-test explanation." } }],
  });
};

const watchdog = setTimeout(() => {
  console.error("Electron smoke test exceeded its deadline.");
  app.exit(1);
}, 20_000);
require("../out/main/index.js");

async function waitFor(window, expression) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Renderer did not reach expected state: ${expression}`);
}

app
  .whenReady()
  .then(async () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.webContents.isLoading() || !window.webContents.getURL()) {
      await new Promise((resolve, reject) => {
        window.webContents.once("did-finish-load", resolve);
        window.webContents.once("did-fail-load", (_, code, description) =>
          reject(new Error(`${code}: ${description}`)),
        );
      });
    }
    await waitFor(
      window,
      "Boolean(window.studyAssistant && document.querySelector('.collapse-button'))",
    );
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const settings = await evaluate("window.studyAssistant.getSettings()");
    assert.equal(
      settings.encryptionAvailable,
      true,
      "Native OS key storage must be available for this smoke test.",
    );
    assert.equal(settings.hasApiKey, false);
    await evaluate("window.studyAssistant.saveApiKey('fake-smoke-test-key')");
    assert.equal(
      (await evaluate("window.studyAssistant.getSettings()")).hasApiKey,
      true,
    );
    assert.equal(
      readFileSync(join(directory, "openrouter-key.bin")).includes(
        Buffer.from("fake-smoke-test-key"),
      ),
      false,
    );
    const reply = await evaluate(
      "window.studyAssistant.askAssistant({question:'Explain a practice question.'})",
    );
    assert.equal(authorization, "Bearer fake-smoke-test-key");
    assert.equal(reply.text, "A smoke-test explanation.");
    await evaluate("window.studyAssistant.clearApiKey()");
    assert.equal(
      (await evaluate("window.studyAssistant.getSettings()")).hasApiKey,
      false,
    );
    console.log(
      "PASS: native encryption, preload IPC, key clearing, and mocked API authorization",
    );

    await evaluate("document.querySelector('.collapse-button').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.sidebar-collapsed') && document.querySelector('.collapse-button').getAttribute('aria-expanded') === 'false')",
    );
    await evaluate(
      "document.querySelector('.collapse-button').click(); document.querySelector('.settings-nav').click()",
    );
    await waitFor(
      window,
      "Boolean(document.querySelector('.settings-content'))",
    );
    await evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown', {key:'1', ctrlKey:true}))",
    );
    await waitFor(window, "Boolean(document.querySelector('.desk-body'))");
    await evaluate("document.querySelector('.settings-nav').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.settings-content'))",
    );
    await evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown', {key:'1', metaKey:true}))",
    );
    await waitFor(window, "Boolean(document.querySelector('.desk-body'))");
    assert.equal(
      await evaluate("document.querySelector('.nav-muted').disabled"),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('.coming-soon').textContent"),
      "Soon",
    );
    console.log(
      "PASS: sidebar collapse/expand, Ctrl+1 and Command+1, disabled coming-soon history",
    );

    const untrustedFile = join(directory, "untrusted.html");
    writeFileSync(
      untrustedFile,
      "<!doctype html><html><body>Untrusted fixture</body></html>",
    );
    const originalUrl = window.webContents.getURL();
    const blocked = new Promise((resolve) =>
      window.webContents.once("will-frame-navigate", (event) =>
        resolve(event.defaultPrevented),
      ),
    );
    await evaluate(
      `window.location.assign(${JSON.stringify(pathToFileURL(untrustedFile).href)})`,
    );
    assert.equal(await blocked, true);
    assert.equal(window.webContents.getURL(), originalUrl);
    // Programmatic loads bypass navigation events. The independent IPC URL guard
    // must still refuse a different page, even in the same BrowserWindow.
    await window.loadFile(untrustedFile);
    await assert.rejects(
      evaluate("window.studyAssistant.getSettings()"),
      /not available from this window/,
    );
    console.log(
      "PASS: local-file navigation blocked and untrusted main-frame IPC rejected",
    );
    clearTimeout(watchdog);
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(watchdog);
    app.exit(1);
  });
