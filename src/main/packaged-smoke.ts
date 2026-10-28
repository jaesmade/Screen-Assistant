import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";

export async function runPackagedSmoke(
  window: BrowserWindow,
  directory: string,
) {
  const started = Date.now();
  const watchdog = setTimeout(() => app.exit(1), 60_000);
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  async function wait(expression: string, win = window) {
    const end = Date.now() + 30_000;
    while (Date.now() < end) {
      if (await win.webContents.executeJavaScript(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error("Packaged UI did not become ready");
  }
  try {
    assert.equal(app.isPackaged, true);
    await wait(
      "Boolean(window.studyAssistant && document.querySelector('.app-shell'))",
    );
    const settings = await evaluate("window.studyAssistant.getSettings()");
    assert.equal(settings.encryptionAvailable, true);
    await evaluate("window.studyAssistant.saveApiKey('packaged-test-key')");
    const crop = await evaluate(
      `(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,200);ctx.fillStyle='black';ctx.font='42px Arial';ctx.fillText('The quick brown fox jumps over the lazy dog.',30,105);return canvas.toDataURL('image/png');})()`,
    );
    const text = await evaluate(
      `window.studyAssistant.recognizeText(${JSON.stringify(crop)},crypto.randomUUID())`,
    );
    assert.match(text.text, /quick brown fox/i);
    await evaluate("window.studyAssistant.showOverlay()");
    const overlay = BrowserWindow.getAllWindows().find(
      (win) => win !== window,
    )!;
    assert.ok(overlay);
    assert.equal(overlay.isAlwaysOnTop(), true);
    await wait("Boolean(document.querySelector('.overlay-shell'))", overlay);
    await assert.rejects(
      overlay.webContents.executeJavaScript(
        "window.studyAssistant.saveApiKey('not-allowed')",
      ),
      /not available/,
    );
    global.fetch = async () =>
      new Response(
        'data: {"model":"packaged-test/free","choices":[{"delta":{"content":"**Verified:** $x = 5$"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      );
    const answer = await overlay.webContents.executeJavaScript(
      "window.studyAssistant.askAssistant({question:'Packaged overlay practice'},crypto.randomUUID())",
    );
    assert.ok(answer.historyId);
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      1,
    );
    await overlay.webContents.executeJavaScript(
      "window.studyAssistant.hideOverlay()",
    );
    assert.equal(overlay.isVisible(), false);
    await evaluate("window.studyAssistant.clearApiKey()");
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(
        {
          passed: true,
          version: app.getVersion(),
          packaged: app.isPackaged,
          ocr: true,
          overlay: true,
          encryption: true,
          streaming: true,
          elapsedMs: Date.now() - started,
          desktop: await evaluate("window.studyAssistant.getDesktopState()"),
        },
        null,
        2,
      ),
    );
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify({ passed: false, error: String(error) }),
    );
    clearTimeout(watchdog);
    app.exit(1);
  }
}
