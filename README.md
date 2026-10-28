# Study Desk

A desktop study coach that turns a question on your screen into an explanation you can work through. Type a question or capture a window, crop to the relevant area, and ask for help through OpenRouter's free model route.

Built for practice and assessments where AI assistance is permitted. Windows is the primary development and testing platform.

**[Download the Windows x64 installer](https://github.com/jaesmade/Screen-Assistant/releases/latest)** or follow the development setup below.

## What works today

- **Text questions:** type or paste a question and receive an explanation with the model name shown below it.
- **Rich explanations:** Markdown headings, lists, tables, code blocks, and inline or display math rendered with KaTeX.
- **Streaming responses:** explanations appear as they arrive, with a stop control and visible status for interrupted output.
- **Saved questions:** successful explanations and their crops are saved locally, with search, reopening, individual deletion, and clear-all controls.
- **Screen and window capture:** choose a source, take a screenshot, and crop it locally before attaching it.
- **Local OCR:** extract English printed text from a crop, review and correct it, then replace or append to your question. The OCR engine and language data are bundled for offline use.
- **Quick overlay:** a dedicated, draggable, always-on-top workspace opened system-wide with `Ctrl+Shift+Space`, with capture, OCR, and streaming explanations.
- **Windows installer:** per-user NSIS setup with desktop and Start menu shortcuts, an uninstaller, and preserved local data on upgrade.
- **Free model routing:** requests use `openrouter/free`; the selected model can differ between requests.
- **Local key storage:** save, replace, or remove an OpenRouter API key in Settings, using native OS encryption.
- **Study workspace:** collapsible navigation, a practice-use confirmation, loading states, and visible error messages.

This is an early MVP. The Windows x64 installer is unsigned; code signing and automatic app updates are not configured.

## Get started

### Install on Windows

Download `Study-Desk-0.2.0-Setup-x64.exe` from [Releases](https://github.com/jaesmade/Screen-Assistant/releases). Run the per-user setup and choose an installation folder. No Node.js installation is needed to use the packaged app. The release includes `SHA256SUMS.txt` for checking the download. Windows may show an unknown-publisher warning because this build is unsigned.

Local OCR works immediately, including offline. Add an OpenRouter key in **Settings** when you want AI explanations. User data stays in Electron's existing `screen-study-assistant` app-data folder, so upgrades preserve the saved key and questions. Uninstalling preserves that folder too; clear the key and history in the app first if you want to remove them.

### Quick overlay and tray

While Study Desk is running, press **Ctrl+Shift+Space** from any application to toggle the overlay. It appears near the pointer's monitor and stays above ordinary windows. Drag its header to reposition it, resize its edges, or press **Esc** to hide it. The main window also has a **Quick overlay** button, and Settings shows whether the global shortcut registered successfully.

Type a question, capture a crop, or extract text locally. Confirm AI assistance is allowed before asking. Complete overlay explanations are saved to the same local history; use the arrow button to open the full study desk and settings. Hiding the overlay stops its unfinished request. Closing the main window does not cancel an overlay request.

Closing the main window keeps Study Desk in the system tray. Double-click the tray icon to reopen the desk, or use its menu to open the overlay. Choose **Quit Study Desk** from that menu to exit completely. If another app owns the shortcut, the tray and in-app button remain available. The overlay does not capture automatically; it temporarily hides while taking a selected screenshot.

### Requirements

- Node.js **22.18.0 or newer**, with npm.
- A desktop session. Secure OS key storage is required to save and use an API key; local OCR works without a key.
- An OpenRouter account and API key for explanations.
- Internet access when sending a question.

### Install and launch

From the repository root:

```powershell
npm ci
npm run dev
```

The command opens the Electron app with the development renderer.

### Connect OpenRouter

1. Get an API key from your [OpenRouter account](https://openrouter.ai/).
2. Open **Settings** in Study Desk.
3. Paste the key and select **Save key**.
4. Return to **Study desk**.

The app reads the saved credential from encrypted local storage. No `.env` file is required. To replace it, save a new key in Settings; to remove it, select **Remove saved key**.

The route is currently fixed to `openrouter/free`. Model availability, response times, and usage limits can vary; the app does not provide a model picker or paid-model fallback.

## Ask a question

1. Type or paste a question into **Question or topic**. You can also leave it empty and attach a question image.
2. To attach an image, select **Capture a screen or window**, choose a source, and select **Capture selected**.
3. Drag over the question and select **Use this crop**. The crop appears beside your input; you can remove or replace it before submitting.
4. Confirm **I'm practicing or AI help is allowed for this assessment**.
5. Select **Help me understand** and watch the explanation appear in the study-coach panel. Select **Stop** to interrupt it.

Questions support up to 12,000 characters. Each submission is a separate request: earlier questions and answers are not sent as conversation context. Completed explanations, the submitted question, any attached crop, and the model name are saved automatically. If saving fails, the explanation remains visible with a warning.

### Extract text locally

1. Select **Extract text from screen** below the question input, then choose a screen or window and capture it.
2. Drag around the relevant text and select **Extract text from crop**. If you already have a crop attached, use **Extract attached crop** instead.
3. Wait for local recognition, then review and edit the extracted text beside the crop. Confidence is an estimate; check equations, symbols, and line breaks carefully.
4. Select **Use text** or **Replace question**. If you have an existing question, **Append text** adds the reviewed text beneath it. Text must fit the 12,000-character question limit.
5. Optionally check **Also attach this crop**. It starts unchecked: applying text alone removes any existing image attachment, so a subsequent explanation request sends only your reviewed question text.

Extraction runs on this device using Tesseract.js and bundled English language data. It needs no API key, network connection, or runtime language download. Reading a crop does not call OpenRouter or create a history entry. You still select **Help me understand** separately to request an explanation.

Use **Stop extraction** to cancel, **Try again** after a stopped or failed attempt, or **Choose another crop** for a clearer selection. Closing the dialog cancels active recognition and leaves your question unchanged. Local extraction has a two-minute timeout and releases its worker process after completion, cancellation, or failure.

OCR currently targets **English printed text**. It does not reliably transcribe handwriting, diagrams, or mathematical layout into LaTeX; review the text or attach the crop when those details matter.

### Streaming and stopping

The app requests an OpenRouter event stream and updates the formatted answer as text arrives. An initial thinking state remains visible while the provider prepares its first text; free-model selection and reasoning can still delay that first update.

Select **Stop** in the study-coach panel to abort the connection. Text received so far stays visible and is marked **Partial explanation**. Stopped, interrupted, timed-out, and output-limited responses are not saved to history. If a provider fails mid-stream, the app keeps the partial text and shows the error so you can try again. Stopping the client connection does not guarantee that every provider immediately stops its own generation.

One response can run at a time. The 60-second request deadline includes the initial connection and the entire stream. Closing or reloading the app window aborts an active stream. Once a response finishes, its complete text is saved as a single history entry.

| Control | Action |
| --- | --- |
| `Ctrl+1` on Windows / `Command+1` on macOS | Return to the study desk when capture and OCR dialogs are closed |
| Sidebar toggle | Collapse or expand navigation |
| Recent questions | Search saved questions, explanation previews, and model names; reopen an entry without sending another API request |
| New question | Clear the current workspace and start a fresh question |
| Eye icon beside a crop | Preview the attached or restored screenshot |

### Revisit saved questions

Open **Recent questions** in the sidebar to browse your saved explanations. Select an entry to restore its question, crop, and formatted answer to the desk. Use the trash icon to delete one entry, or **Clear history** and **Clear all** to remove the collection. Opening an entry does not call OpenRouter; submitting it again makes a new request and saves a new entry.

History survives app restarts and retains the latest **100 questions**, within a **50 MB** file-size limit. Older entries are removed as needed when a new answer is saved. Failed, stopped, and incomplete responses are not saved.

### Supported answer formatting

Answers render Markdown headings, emphasis, lists, blockquotes, tables, inline code, and fenced code blocks. Use `$x = 5$` for inline math and `$$` on separate lines around display equations. KaTeX styles and fonts are bundled locally; unsupported math remains readable instead of breaking the answer panel.

Raw HTML is ignored, remote Markdown images are replaced by their alt text, and only HTTP/HTTPS links are available. Selecting a supported link opens it in your default browser while keeping the app on the study desk.

## Capture, data, and credentials

Capture and cropping happen on your device. Opening the capture dialog lists available screen and window names; a screenshot is taken only when you select **Capture selected**. A chosen crop stays local while you attach it or review its extracted text. Submitting the question sends the question text and any attached crop to OpenRouter for processing by the selected provider.

OCR runs in a separate Electron utility process, with the engine, worker code, and English data loaded from installed dependencies. OCR images and review text are kept in memory; extraction does not write image files or language caches. Only applied text and an explicitly attached crop can become part of a subsequently completed question's history entry.

The main process manages saved credentials and authenticated API requests. The key is encrypted with Electron's asynchronous `safeStorage` API and stored as `openrouter-key.bin` in Electron's user-data directory. The renderer receives saved-key and encryption-availability status, rather than the stored key itself.

Question history is stored separately as **unencrypted local JSON** in `question-history.json`, in the same user-data directory. It contains questions, answers, timestamps, model names, and any submitted crops; it does not include your API key. Removing the saved key does not remove history. Use **Clear history** to remove saved study content.

Saving and reading credentials require secure encryption to be available. On Linux, the app accepts known libsecret or KWallet backends and refuses the `basic_text` fallback and unrecognized backends.

The renderer uses context isolation and sandboxing with Node integration disabled. A narrow typed preload bridge exposes capture, settings, and assistant operations; IPC checks the calling window, main frame, and renderer URL. Document navigation and new windows are blocked.

The overlay uses a separate sandboxed renderer. Its requests are tied to that window: it cannot edit stored credentials or read full history, and one window cannot cancel another's request. Credential management and history browsing stay in the main study desk.

## Development

Built with **Electron**, **React**, **TypeScript**, **electron-vite**, **Lucide React**, and **Tesseract.js**.

```text
src/
  main/
    index.ts          Electron lifecycle, capture, IPC, and OpenRouter requests
    credentials.ts    Encrypted credential storage and key rotation
    history.ts        Atomic local history storage and retention limits
    request.ts        HTTP requests with a response/body deadline
    stream.ts         OpenRouter SSE parsing, progress, and interruption handling
    ocr.ts            OCR job lifecycle, cancellation, timeouts, and validation
    ocr-process.ts    Electron utility-process transport
    ocr-worker.ts     Local Tesseract engine and bundled English data
    desktop.ts        Global shortcut, overlay positioning, and system tray
    packaged-smoke.ts  Packaged-app diagnostic checks
    security.ts       Trusted renderer URL validation
  preload/
    index.ts          Renderer-to-main bridge
  renderer/
    src/App.tsx       Study desk, settings, capture, and crop selection
    src/AnswerMarkdown.tsx  Markdown and KaTeX answer rendering
    src/HistoryPage.tsx     Search, reopen, and delete saved questions
    src/OcrDialog.tsx       Recognition progress, editable review, and text application
    src/CaptureDialog.tsx   Shared source selection and crop controls
    src/Overlay.tsx         Compact always-on-top workspace
    src/useAssistantResponse.ts  Shared streaming and cancellation lifecycle
    src/LazyFeatures.tsx    On-demand loading of heavier UI features
    src/styles.css    App styling
  shared/
    types.ts          Shared request, response, and bridge types
tests/
  backend.test.mjs     Credential, URL-validation, and timeout regression tests
  history.test.mjs     Persistence, retention, concurrency, and recovery checks
  stream.test.mjs      SSE framing, incremental output, errors, cancellation, and deadlines
  ocr.test.mjs         OCR validation, lifecycle, progress, cancellation, and timeout checks
  electron-smoke.cjs   Built-app integration checks
  run-electron-smoke.mjs
  run-packaged-smoke.mjs
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install dependencies from the lockfile |
| `npm run dev` | Launch Electron with the development renderer |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` | Run backend regression tests |
| `npm run build` | Build main, preload, and renderer bundles into `out/` |
| `npm run preview` | Launch the built app |
| `npm run test:electron` | Run integration checks against the built app |
| `npm run pack:win` | Build an unpacked Windows x64 application in `dist/win-unpacked/` |
| `npm run dist:win` | Build the Windows x64 NSIS installer in `dist/` |
| `npm run test:packaged` | Run native encryption, real OCR, streaming, history, and overlay checks in the packaged executable |

To verify a change, run these commands in order:

```powershell
npm run typecheck
npm test
npm run build
npm run test:electron
```

The regression tests use fake credential storage, temporary history files, and mocked HTTP/SSE responses. Stream checks cover fragmented UTF-8 and SSE frames, keep-alive comments, usage chunks, incremental output, malformed and incomplete streams, provider errors, cancellation, and timeouts.

The Electron smoke test uses real native encryption, a temporary user-data directory, and mocked API streams. It verifies the preload bridge, credentials, navigation, persisted history, search and deletion, restored crops, Markdown/math rendering, and rejection of unsafe content and untrusted IPC. It holds a stream open to verify incremental rendering before completion, stop controls, stale-event filtering, listener cleanup, and aborting on reload. It also checks that incomplete requests are excluded from history and that a history-save failure preserves a completed answer.

OCR checks use the **real bundled recognition engine** with generated text and blank images, without an API key. The capture source is mocked to avoid capturing the user's other windows. The smoke flow covers crop selection, review and correction, text limits, replace/append, optional image attachment, cancellation/retry, and utility-process cleanup. The full smoke test requires an available desktop session and secure OS storage, and removes its temporary data when Electron exits.

**The automated checks do not require an API key or contact OpenRouter.** Build before running the Electron smoke test so it checks the latest code. The packaged test uses a temporary user-data directory and removes it afterward; it can also target an installed executable with `node tests/run-packaged-smoke.mjs "C:\path\to\Study Desk.exe"`.

### Packaging, optimization, and releases

`electron-builder.yml` defines a per-user, assisted NSIS installer. OCR workers and runtime dependencies are unpacked from ASAR so native worker paths and WASM files work after installation. Language data and Node OCR CPU variants are included; unused legacy language data and browser OCR bundles are excluded. Build tools and renderer-only dependencies stay out of the installed Node runtime.

Renderer assets are minified, and Markdown/math, history, capture, OCR review, and overlay UI load on demand. The initial JavaScript path is about **254 KB**, compared with the earlier **1.65 MB** single bundle. Markdown rendering is memoized, streaming updates are coalesced, and history retention serializes crop entries once instead of repeatedly encoding the whole collection while pruning. These are build-size measurements, not startup-time guarantees.

To publish a release, update the version and matching `docs/releases/vX.Y.Z.md`, then run checks, `npm run dist:win`, and `npm run test:packaged`. Commit and push the version tag, then run `node scripts/publish-release.mjs vX.Y.Z`. The script creates a draft, uploads the installer and SHA-256 manifest, verifies upload sizes/digests, and publishes it. It uses `GH_TOKEN`/`GITHUB_TOKEN` or an existing Git Credential Manager credential without printing it. The **Windows release** GitHub Actions workflow provides the same build-and-publish flow on manual dispatch for an existing tag.

### Live verification

A separate live integration run on **October 28, 2026**, on Windows exercised real OpenRouter requests through the app's `openrouter/free` route:

| Scenario | Observed result | Response time | Reported API cost |
| --- | --- | --- | --- |
| Text question: `3x + 4 = 19` | Correct answer, `x = 5`, displayed in the app | About 28 seconds | $0 |
| Window selection, capture, local crop, and image question: `7x + 5 = 26` | Correct answer, `x = 3`, displayed in the app | About 4 seconds | $0 |

The run used temporary encrypted credential storage and cleared it afterward. These are observations from one live run, not latency or availability guarantees. That run used non-streaming responses; streaming is covered separately by the automated checks above. Live API testing is separate from the checked-in automated tests.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The app asks for an API key | Save a key in Settings before submitting a question. |
| Secure storage is unavailable | Run in a desktop session with a supported OS secret store. The app refuses to save the key without encryption. |
| OpenRouter reports an authentication or usage-limit error | Check the key and account limits in OpenRouter. Provider errors are surfaced in the app. |
| A request times out | Try again later. The 60-second deadline includes receiving the response and reading its body. |
| An explanation stops partway through | Check the displayed error. Partial text remains visible but is not saved; try again or ask a shorter question if the model reached its output limit. |
| A selected screen or window is no longer available | Reopen capture and choose an available source. |
| A crop cannot be used | Drag a larger selection; both dimensions must be at least 16 displayed pixels. |
| A formula does not render | Math uses `$...$` or `$$...$$` delimiters and KaTeX-supported commands. Unsupported notation stays visible as text. |
| OCR finds no text or makes mistakes | Try a tighter crop with larger, clear English printed text. Correct the review field before applying; diagrams and handwriting may need the original crop. |
| Local recognition cannot start | Run `npm ci` to restore the OCR engine and bundled English data, then rebuild the app. |
| History cannot be read or an answer was not saved | Check access to the app's user-data directory. Unreadable history is preserved until you explicitly clear it using **Recent questions → Clear history**. |
