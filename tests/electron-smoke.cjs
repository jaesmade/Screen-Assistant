const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  desktopCapturer,
  nativeImage,
} = require("electron");

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
let requestCount = 0;
let failNextRequest = false;
let holdNextStream = false;
let holdBeforeText = false;
let heldStream;
const partialAnswer =
  "## Live explanation\n\n**First step:** subtract $4$ from both sides.\n\n";
const finalStreamText = "**Answer:** $x = 5$.";
const encode = (text) => new TextEncoder().encode(text);
const streamEvent = (payload) =>
  `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
const streamDelta = (text) =>
  streamEvent({
    model: "fake-smoke-model",
    choices: [{ index: 0, delta: { content: text } }],
  });
const streamEnd =
  streamEvent({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }) +
  streamEvent({ choices: [], usage: { total_tokens: 10 } }) +
  streamEvent("[DONE]");
const richAnswer = String.raw`## Worked example

**Answer:** $x = 5$.

1. Subtract four.
2. Divide by three.

$$
\frac{19 - 4}{3} = 5
$$

| Step | Value |
| --- | --- |
| Result | 5 |

\`\`\`js
const example = "**literal** $code$";
\`\`\`

[Unsafe link](javascript:alert(1))
[Read more](https://example.com/learn)
![Remote image](https://example.invalid/track.png)
<script>window.modelScriptRan = true</script>

Invalid math stays readable: $\notARealCommand{x}$.
`.replaceAll("\\`", "`");
const crop =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=";
global.fetch = async (_, options) => {
  requestCount++;
  authorization = options.headers.Authorization;
  assert.equal(JSON.parse(options.body).stream, true);
  if (failNextRequest) {
    failNextRequest = false;
    return Response.json(
      { error: { message: "Test rate limit" } },
      { status: 429 },
    );
  }
  if (holdNextStream) {
    holdNextStream = false;
    const empty = holdBeforeText;
    holdBeforeText = false;
    heldStream = { signal: options.signal, cancelled: false };
    const held = heldStream;
    return new Response(
      new ReadableStream({
        start(controller) {
          if (!empty) controller.enqueue(encode(streamDelta(partialAnswer)));
          held.complete = () => {
            controller.enqueue(
              encode(streamDelta(finalStreamText) + streamEnd),
            );
            controller.close();
          };
          held.fail = () => {
            controller.enqueue(
              encode(
                streamEvent({ error: { message: "Test mid-stream error" } }),
              ),
            );
            controller.close();
          };
          held.disconnect = () => controller.close();
        },
        cancel() {
          held.cancelled = true;
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }
  return new Response(
    ": OPENROUTER PROCESSING\n\n" +
      streamDelta(richAnswer.slice(0, 40)) +
      streamDelta(richAnswer.slice(40)) +
      streamEnd,
    { headers: { "Content-Type": "text/event-stream" } },
  );
};

const watchdog = setTimeout(() => {
  console.error("Electron smoke test exceeded its deadline.");
  app.exit(1);
}, 120_000);
require("../out/main/index.js");

async function waitFor(window, expression, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
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
    assert.equal(reply.text, richAnswer);
    assert.ok(reply.historyId);
    assert.equal(reply.historyWarning, undefined);
    const imageReply = await evaluate(
      `window.studyAssistant.askAssistant({question:'',imageDataUrl:${JSON.stringify(crop)}})`,
    );
    assert.ok(imageReply.historyId);
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      2,
    );
    assert.equal(
      (
        await evaluate(
          `window.studyAssistant.getHistoryEntry(${JSON.stringify(imageReply.historyId)})`,
        )
      ).imageDataUrl,
      crop,
    );
    failNextRequest = true;
    await assert.rejects(
      evaluate(
        "window.studyAssistant.askAssistant({question:'A failed request'})",
      ),
      /Test rate limit/,
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      2,
    );
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
    console.log("PASS: sidebar collapse/expand, Ctrl+1 and Command+1");

    // Reload simulates reopening the renderer without relying on in-memory history.
    window.webContents.reload();
    await new Promise((resolve) =>
      window.webContents.once("did-finish-load", resolve),
    );
    await waitFor(window, "Boolean(document.querySelector('.history-nav'))");
    await evaluate("document.querySelector('.history-nav').click()");
    await waitFor(
      window,
      "document.querySelectorAll('.history-item').length === 2",
    );
    const beforeOpen = requestCount;
    await evaluate("document.querySelector('.history-open').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.answer-text .katex') && document.querySelector('.capture-attach.has-image'))",
    );
    assert.equal(
      requestCount,
      beforeOpen,
      "Opening history must not send another API request",
    );
    assert.equal(
      await evaluate("document.querySelector('.capture-attach img').src"),
      crop,
    );
    assert.equal(
      await evaluate("document.querySelector('.answer-text h2').textContent"),
      "Worked example",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.answer-text strong').textContent",
      ),
      "Answer:",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.answer-text ol li').length"),
      2,
    );
    assert.equal(
      await evaluate(
        "Boolean(document.querySelector('.answer-text table') && document.querySelector('.answer-text .katex-display'))",
      ),
      true,
    );
    assert.match(
      await evaluate(
        "document.querySelector('.answer-text pre code').textContent",
      ),
      /\*\*literal\*\* \$code\$/,
    );
    assert.equal(
      await evaluate(
        "Boolean(document.querySelector('.answer-text script, .answer-text img, .answer-text a[href^=\"javascript:\"]') || window.modelScriptRan)",
      ),
      false,
    );
    assert.equal(
      await evaluate("document.querySelector('.answer-text a').href"),
      "https://example.com/learn",
    );
    await assert.rejects(
      evaluate("window.studyAssistant.openExternalLink('file:///C:/Windows')"),
      /cannot be opened/,
    );
    assert.match(
      await evaluate("document.querySelector('.answer-text').textContent"),
      /notARealCommand/,
    );
    await evaluate(
      "document.querySelector('[aria-label=\"View screenshot\"]').click()",
    );
    await waitFor(
      window,
      "Boolean(document.querySelector('.image-preview img'))",
    );
    await evaluate(
      "document.querySelector('[aria-label=\"Close screenshot preview\"]').click()",
    );
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR) {
      writeFileSync(
        join(process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR, "markdown-math.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    console.log(
      "PASS: persisted history reopens without API calls, restores crop, and safely renders Markdown, tables, code, and math",
    );

    await evaluate("document.querySelector('.history-nav').click()");
    await waitFor(
      window,
      "document.querySelectorAll('.history-item').length === 2",
    );
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR) {
      writeFileSync(
        join(process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR, "saved-history.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    await evaluate(`(() => {
      const input=document.querySelector('.history-search input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Explain a practice');
      input.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await waitFor(
      window,
      "document.querySelectorAll('.history-item').length === 1",
    );
    assert.match(
      await evaluate("document.querySelector('.history-open').textContent"),
      /Explain a practice question/,
    );
    await evaluate("document.querySelector('.history-delete').click()");
    await waitFor(
      window,
      "document.querySelectorAll('.history-item').length === 0",
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      1,
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.history-toolbar button')).find(e=>e.textContent.includes('Clear history')).click()",
    );
    await waitFor(
      window,
      "Boolean(document.querySelector('.history-confirm'))",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.history-confirm button')).find(e=>e.textContent.includes('Cancel')).click()",
    );
    await waitFor(window, "!document.querySelector('.history-confirm')");
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      1,
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.history-toolbar button')).find(e=>e.textContent.includes('Clear history')).click()",
    );
    await waitFor(
      window,
      "Boolean(document.querySelector('.history-confirm'))",
    );
    await evaluate("document.querySelector('.button-danger').click()");
    await waitFor(
      window,
      "document.querySelector('.history-count').textContent === '0 saved'",
    );
    assert.deepEqual(await evaluate("window.studyAssistant.getHistory()"), []);

    // Exercise the renderer submit flow rather than only direct IPC calls.
    await evaluate("window.studyAssistant.saveApiKey('fake-smoke-test-key')");
    await evaluate("document.querySelector('.history-heading button').click()");
    await waitFor(window, "Boolean(document.querySelector('#question-input'))");
    await evaluate(`(() => {
      const input = document.querySelector('#question-input');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Renderer flow practice question');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('.confirm-row input').click();
    })()`);
    await waitFor(window, "!document.querySelector('.ask-button').disabled");
    await evaluate("document.querySelector('.ask-button').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.answer-text .katex')) && document.querySelector('.answer-footer').textContent.includes('Saved in recent questions')",
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()"))[0].question,
      "Renderer flow practice question",
    );
    await evaluate("document.querySelector('.new-question-link').click()");
    await waitFor(
      window,
      "!document.querySelector('.answer-content') && document.querySelector('#question-input').value === ''",
    );

    async function submitStreamingQuestion(question) {
      await evaluate(`(() => {
        const input = document.querySelector('#question-input');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(question)});
        input.dispatchEvent(new Event('input',{bubbles:true}));
        const check = document.querySelector('.confirm-row input');
        if (!check.checked) check.click();
      })()`);
      await waitFor(window, "!document.querySelector('.ask-button').disabled");
      await evaluate("document.querySelector('.ask-button').click()");
    }
    async function resetQuestion() {
      await evaluate("document.querySelector('.new-question-link').click()");
      await waitFor(
        window,
        "!document.querySelector('.answer-content') && document.querySelector('#question-input').value === ''",
      );
    }
    async function startHeldQuestion(question, beforeText = false) {
      heldStream = null;
      holdNextStream = true;
      holdBeforeText = beforeText;
      await submitStreamingQuestion(question);
      await waitFor(
        window,
        beforeText
          ? "Boolean(document.querySelector('.stop-response') && document.querySelector('.thinking-state'))"
          : "Boolean(document.querySelector('.stop-response')) && document.querySelector('.answer-text')?.textContent.includes('First step')",
      );
      const deadline = Date.now() + 5000;
      while (!heldStream && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(heldStream);
      return heldStream;
    }

    const savedBeforeStreaming = (
      await evaluate("window.studyAssistant.getHistory()")
    ).length;
    await evaluate(
      "window.streamEvents = []; window.unsubscribeStream = window.studyAssistant.onAssistantUpdate(update => window.streamEvents.push(update)); void 0",
    );
    const progressive = await startHeldQuestion(
      "Stream a practice explanation",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.question-field-wrap textarea').disabled && document.querySelector('.history-nav').disabled",
      ),
      true,
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming,
      "Partial streams must not be saved",
    );
    assert.equal(
      await evaluate(
        "window.studyAssistant.cancelAssistant('00000000-0000-0000-0000-000000000000')",
      ),
      false,
    );
    await assert.rejects(
      evaluate(
        "window.studyAssistant.askAssistant({question:'Overlapping request'})",
      ),
      /already in progress/,
    );
    const [firstEvent] = await evaluate("window.streamEvents");
    assert.deepEqual(Object.keys(firstEvent).sort(), [
      "model",
      "requestId",
      "text",
    ]);
    assert.equal(firstEvent.text, partialAnswer);
    await evaluate("window.unsubscribeStream()");
    const detachedCount = await evaluate("window.streamEvents.length");
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR)
      writeFileSync(
        join(
          process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR,
          "streaming-response.png",
        ),
        (await window.webContents.capturePage()).toPNG(),
      );
    progressive.complete();
    await waitFor(
      window,
      "!document.querySelector('.stop-response') && document.querySelector('.answer-footer').textContent.includes('Saved in recent questions')",
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming + 1,
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()"))[0].question,
      "Stream a practice explanation",
    );
    assert.equal(
      await evaluate("window.streamEvents.length"),
      detachedCount,
      "Unsubscribed listeners must not receive more updates",
    );

    await resetQuestion();
    const cancelled = await startHeldQuestion("Stop a partial explanation");
    await evaluate("document.querySelector('.stop-response').click()");
    await waitFor(
      window,
      "!document.querySelector('.stop-response') && document.querySelector('.response-notice')?.textContent.includes('Response stopped')",
    );
    assert.equal(cancelled.signal.aborted, true);
    assert.equal(cancelled.cancelled, true);
    assert.match(
      await evaluate("document.querySelector('.answer-text').textContent"),
      /First step/,
    );
    assert.match(
      await evaluate("document.querySelector('.answer-label').textContent"),
      /PARTIAL EXPLANATION/,
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming + 1,
    );

    await resetQuestion();
    const beforeText = await startHeldQuestion(
      "Stop before the first token",
      true,
    );
    await evaluate("document.querySelector('.stop-response').click()");
    await waitFor(
      window,
      "!document.querySelector('.stop-response') && document.querySelector('.response-notice')?.textContent.includes('before any explanation')",
    );
    assert.equal(beforeText.signal.aborted, true);
    assert.equal(
      await evaluate("Boolean(document.querySelector('.answer-content'))"),
      false,
    );

    await resetQuestion();
    const broken = await startHeldQuestion("Handle an interrupted explanation");
    // A late event from an old request cannot replace the current explanation.
    window.webContents.send("assistant:update", {
      requestId: firstEvent.requestId,
      text: "STALE RESPONSE",
      model: "stale",
    });
    broken.fail();
    await waitFor(
      window,
      "!document.querySelector('.stop-response') && document.querySelector('.response-error')?.textContent.includes('Test mid-stream error')",
    );
    assert.match(
      await evaluate("document.querySelector('.answer-text').textContent"),
      /First step/,
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming + 1,
    );

    await resetQuestion();
    const disconnected = await startHeldQuestion("Handle a closed stream");
    disconnected.disconnect();
    await waitFor(
      window,
      "!document.querySelector('.stop-response') && document.querySelector('.response-error')?.textContent.includes('connection ended')",
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming + 1,
    );

    await resetQuestion();
    const reloaded = await startHeldQuestion(
      "Abort when the study desk reloads",
    );
    window.webContents.reload();
    await new Promise((resolve) =>
      window.webContents.once("did-finish-load", resolve),
    );
    await waitFor(window, "Boolean(document.querySelector('#question-input'))");
    assert.equal(reloaded.signal.aborted, true);
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()")).length,
      savedBeforeStreaming + 1,
    );
    await submitStreamingQuestion("A new response after reload");
    await waitFor(
      window,
      "Boolean(document.querySelector('.answer-text .katex')) && document.querySelector('.answer-footer').textContent.includes('Saved in recent questions')",
    );
    await resetQuestion();
    console.log(
      "PASS: incremental IPC/rendering, stop before/during output, stale-event filtering, listener cleanup, interrupted-stream exclusion, and abort on reload",
    );

    // Saving history must never hide a successful provider answer.
    writeFileSync(join(directory, "question-history.json"), "{broken");
    await evaluate("window.studyAssistant.saveApiKey('fake-smoke-test-key')");
    const unsaved = await evaluate(
      "window.studyAssistant.askAssistant({question:'Successful response despite broken history'})",
    );
    assert.equal(unsaved.text, richAnswer);
    assert.ok(unsaved.historyWarning);
    assert.equal(unsaved.historyId, undefined);
    assert.equal(
      readFileSync(join(directory, "question-history.json"), "utf8"),
      "{broken",
    );
    await evaluate(`(() => {
      const input = document.querySelector('#question-input');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Show answer when saving fails');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('.confirm-row input').click();
    })()`);
    await waitFor(window, "!document.querySelector('.ask-button').disabled");
    await evaluate("document.querySelector('.ask-button').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.answer-text .katex') && document.querySelector('.response-error'))",
    );
    assert.match(
      await evaluate("document.querySelector('.response-error').textContent"),
      /could not be saved/,
    );
    await evaluate("document.querySelector('.history-nav').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.history-content .inline-error'))",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.history-toolbar button')).find(e=>e.textContent.includes('Clear history')).click()",
    );
    await waitFor(
      window,
      "Boolean(document.querySelector('.history-confirm'))",
    );
    await evaluate("document.querySelector('.button-danger').click()");
    await waitFor(
      window,
      "!document.querySelector('.history-content .inline-error') && !document.querySelector('.history-confirm')",
    );
    await evaluate("window.studyAssistant.clearApiKey()");
    await assert.rejects(
      evaluate("window.studyAssistant.getHistoryEntry('../bad-id')"),
      /valid saved question/,
    );
    console.log(
      "PASS: history search, deletion, clear cancellation/confirmation, failed-request exclusion, and save-failure recovery",
    );

    // Use a known crop and the actual bundled OCR engine. Capture enumeration is
    // mocked here so the check never screenshots the user's other windows.
    await evaluate(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',ctrlKey:true}))",
    );
    await waitFor(window, "Boolean(document.querySelector('.ocr-entry'))");
    const ocrFixture = await evaluate(`(() => {
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=360;
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1200,360);
      context.fillStyle='black';context.font='bold 34px Arial';context.fillText('PRACTICE QUESTION',60,75);
      context.font='42px Arial';context.fillText('Solve 7x + 5 = 26.',60,150);
      context.font='30px Arial';context.fillText('The quick brown fox jumps over the lazy dog.',60,225);
      return canvas.toDataURL('image/png');
    })()`);
    const blankFixture = await evaluate(
      `(() => {const canvas=document.createElement('canvas');canvas.width=300;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,300,160);return canvas.toDataURL('image/png');})()`,
    );
    const callsBeforeOcr = requestCount;
    assert.equal(
      (await evaluate("window.studyAssistant.getSettings()")).hasApiKey,
      false,
    );
    await assert.rejects(
      evaluate(
        "window.studyAssistant.recognizeText('https://example.com/image.png',crypto.randomUUID())",
      ),
      /valid PNG/,
    );
    await assert.rejects(
      evaluate(
        "window.studyAssistant.recognizeText('data:image/png;base64,aGVsbG8=',crypto.randomUUID())",
      ),
      /could not be read/,
    );
    const emptyOcr = await evaluate(
      `window.studyAssistant.recognizeText(${JSON.stringify(blankFixture)},crypto.randomUUID())`,
    );
    assert.equal(emptyOcr.text, "");
    const originalGetSources = desktopCapturer.getSources;
    desktopCapturer.getSources = async () => [
      {
        id: "window:9999:0",
        name: "OCR practice window",
        thumbnail: nativeImage.createFromDataURL(ocrFixture),
      },
    ];
    async function captureForOcr() {
      await evaluate("document.querySelector('.ocr-entry').click()");
      await waitFor(
        window,
        "Boolean(document.querySelector('.source-option'))",
      );
      await evaluate(
        "Array.from(document.querySelectorAll('.capture-dialog button')).find(e=>e.textContent.includes('Capture selected')).click()",
      );
      await waitFor(
        window,
        "Boolean(document.querySelector('.crop-image-wrap img')?.naturalWidth)",
      );
      await evaluate(`(() => {
        const stage=document.querySelector('.crop-image-wrap');const r=stage.getBoundingClientRect();stage.setPointerCapture=()=>{};
        for(const [type,x,y] of [['pointerdown',0.02,0.02],['pointermove',0.98,0.98],['pointerup',0.98,0.98]]) stage.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,clientX:r.left+r.width*x,clientY:r.top+r.height*y,buttons:type==='pointerup'?0:1}));
      })()`);
      await waitFor(
        window,
        "Boolean(document.querySelector('.crop-selection'))",
      );
      await evaluate(
        "Array.from(document.querySelectorAll('.capture-dialog button')).find(e=>e.textContent.includes('Extract text from crop')).click()",
      );
      await waitFor(window, "Boolean(document.querySelector('.ocr-dialog'))");
      await waitFor(
        window,
        "!document.querySelector('#ocr-text').disabled && document.querySelector('#ocr-text').value.length > 0",
        60000,
      );
    }
    await captureForOcr();
    const recognized = await evaluate(
      "document.querySelector('#ocr-text').value",
    );
    assert.match(recognized, /quick brown fox/i);
    assert.match(recognized, /7x\s*\+\s*5\s*=\s*26/i);
    assert.equal(
      await evaluate(
        "document.querySelector('.ocr-attach-option input').checked",
      ),
      false,
    );
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR)
      await evaluate(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR)
      writeFileSync(
        join(process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR, "ocr-review.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
    await evaluate(
      `(() => {const input=document.querySelector('#ocr-text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'x'.repeat(12001));input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await waitFor(window, "document.querySelector('.ocr-use').disabled");
    await evaluate(
      `(() => {const input=document.querySelector('#ocr-text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Corrected OCR question: Solve 7x + 5 = 26.');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await waitFor(window, "!document.querySelector('.ocr-use').disabled");
    await evaluate("document.querySelector('.ocr-use').click()");
    await waitFor(
      window,
      "!document.querySelector('.ocr-dialog') && document.querySelector('#question-input').value === 'Corrected OCR question: Solve 7x + 5 = 26.'",
    );
    assert.equal(
      await evaluate(
        "Boolean(document.querySelector('.capture-attach.has-image'))",
      ),
      false,
    );
    assert.deepEqual(await evaluate("window.studyAssistant.getHistory()"), []);
    await captureForOcr();
    await evaluate(
      `(() => {const input=document.querySelector('#ocr-text');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Additional OCR notes.');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.ocr-attach-option input').click();})()`,
    );
    await waitFor(window, "!document.querySelector('.ocr-append').disabled");
    await evaluate("document.querySelector('.ocr-append').click()");
    await waitFor(
      window,
      "!document.querySelector('.ocr-dialog') && Boolean(document.querySelector('.capture-attach.has-image'))",
    );
    assert.equal(
      await evaluate("document.querySelector('#question-input').value"),
      "Corrected OCR question: Solve 7x + 5 = 26.\n\nAdditional OCR notes.",
    );
    await evaluate("document.querySelector('.ocr-attached').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.ocr-dialog .ocr-progress'))",
    );
    await evaluate(
      "Array.from(document.querySelectorAll('.ocr-actions button')).find(e=>e.textContent.includes('Stop extraction')).click()",
    );
    await waitFor(window, "Boolean(document.querySelector('.ocr-stopped'))");
    await evaluate("document.querySelector('.ocr-retry').click()");
    await waitFor(
      window,
      "!document.querySelector('#ocr-text').disabled && document.querySelector('#ocr-text').value.length > 0",
      60000,
    );
    await evaluate("document.querySelector('.ocr-close').click()");
    await waitFor(window, "!document.querySelector('.ocr-dialog')");
    assert.match(
      await evaluate("document.querySelector('#question-input').value"),
      /Additional OCR notes/,
    );
    // Closing during initialization must cancel work without applying any text.
    await evaluate("document.querySelector('.ocr-attached').click()");
    await waitFor(
      window,
      "Boolean(document.querySelector('.ocr-dialog .ocr-progress'))",
    );
    await evaluate("document.querySelector('.ocr-close').click()");
    await waitFor(window, "!document.querySelector('.ocr-dialog')");
    assert.match(
      await evaluate("document.querySelector('#question-input').value"),
      /Additional OCR notes/,
    );
    assert.equal(
      requestCount,
      callsBeforeOcr,
      "OCR must not send OpenRouter requests",
    );
    desktopCapturer.getSources = originalGetSources;
    const cleanupDeadline = Date.now() + 5000;
    while (
      app.getAppMetrics().some((metric) => metric.name === "Study Desk OCR") &&
      Date.now() < cleanupDeadline
    )
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
      app.getAppMetrics().some((metric) => metric.name === "Study Desk OCR"),
      false,
    );
    console.log(
      "PASS: real local OCR without an API key, blank crops, capture/crop/review, corrections, text limits, append/replace, optional attachment, cancellation/retry, and process cleanup",
    );

    await evaluate("window.studyAssistant.saveApiKey('fake-smoke-test-key')");
    const desktop = await evaluate("window.studyAssistant.getDesktopState()");
    assert.equal(desktop.shortcut, "CommandOrControl+Shift+Space");
    assert.equal(typeof desktop.shortcutRegistered, "boolean");
    await evaluate("window.studyAssistant.showOverlay()");
    const overlay = BrowserWindow.getAllWindows().find(
      (candidate) => candidate !== window,
    );
    assert.ok(overlay);
    assert.equal(overlay.isAlwaysOnTop(), true);
    assert.equal(overlay.isVisible(), true);
    const evaluateOverlay = (code) =>
      overlay.webContents.executeJavaScript(code);
    await waitFor(overlay, "Boolean(document.querySelector('.overlay-shell'))");
    assert.equal(overlay.webContents.getLastWebPreferences().sandbox, true);
    await assert.rejects(
      evaluateOverlay("window.studyAssistant.saveApiKey('not-allowed')"),
      /not available/,
    );
    await assert.rejects(
      evaluateOverlay("window.studyAssistant.getHistory()"),
      /not available/,
    );
    holdNextStream = true;
    await evaluateOverlay(`(() => {
      const input=document.querySelector('#overlay-question');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Overlay practice question');input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.overlay-confirm input').click();
      window.overlayUpdates=[];window.unsubscribeOverlay=window.studyAssistant.onAssistantUpdate(update=>window.overlayUpdates.push(update));
    })()`);
    await waitFor(
      overlay,
      "!document.querySelector('.overlay-submit .button-primary').disabled",
    );
    await evaluateOverlay(
      "document.querySelector('.overlay-submit .button-primary').click()",
    );
    await waitFor(
      overlay,
      "document.querySelector('.overlay-answer .answer-text')?.textContent.includes('First step')",
    );
    const overlayRequestId = await evaluateOverlay(
      "window.overlayUpdates.at(-1).requestId",
    );
    assert.equal(
      await evaluate(
        `window.studyAssistant.cancelAssistant(${JSON.stringify(overlayRequestId)})`,
      ),
      false,
      "Main window cannot cancel another window request",
    );
    window.close();
    assert.equal(
      window.isDestroyed(),
      false,
      "Closing the desk must keep it available in the tray",
    );
    assert.equal(
      heldStream.signal.aborted,
      false,
      "Closing the desk must not cancel overlay output",
    );
    if (process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR) {
      await evaluateOverlay(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      writeFileSync(
        join(process.env.STUDY_DESK_SMOKE_ARTIFACT_DIR, "quick-overlay.png"),
        (await overlay.webContents.capturePage()).toPNG(),
      );
    }
    await evaluateOverlay("window.studyAssistant.hideOverlay()");
    await waitFor(
      overlay,
      "document.querySelector('.overlay-notice')?.textContent.includes('Response stopped')",
    );
    assert.equal(overlay.isVisible(), false);
    assert.equal(heldStream.signal.aborted, true);
    await evaluate("window.studyAssistant.showOverlay()");
    await waitFor(
      overlay,
      "!document.querySelector('.overlay-submit .button-primary').disabled",
    );
    await evaluateOverlay(
      "document.querySelector('.overlay-submit .button-primary').click()",
    );
    await waitFor(
      overlay,
      "Boolean(document.querySelector('.overlay-answer .katex')) && document.querySelector('.overlay-answer footer').textContent.includes('Saved locally')",
    );
    assert.equal(
      (await evaluate("window.studyAssistant.getHistory()"))[0].question,
      "Overlay practice question",
    );
    await evaluateOverlay("window.studyAssistant.showDesk()");
    assert.equal(window.isVisible(), true);
    assert.equal(overlay.isVisible(), false);
    await evaluate(
      "window.studyAssistant.clearApiKey(); window.studyAssistant.clearHistory()",
    );
    console.log(
      "PASS: global shortcut status, dedicated always-on-top overlay, isolated credentials/history, ownership-aware cancellation, hide/reopen, tray close, and shared streaming history",
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
    await assert.rejects(
      evaluate("window.studyAssistant.getHistory()"),
      /not available from this window/,
    );
    await assert.rejects(
      evaluate("window.studyAssistant.showOverlay()"),
      /not available from this window/,
    );
    await assert.rejects(
      evaluate(
        `window.studyAssistant.recognizeText(${JSON.stringify(ocrFixture)},crypto.randomUUID())`,
      ),
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
