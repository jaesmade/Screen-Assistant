# Study Desk

A Windows-first desktop study coach for practice questions and assessments where AI help is permitted. The app captures only after the user picks a screen or window, lets them crop the question locally, and sends the crop only when they ask for an explanation.

## Run locally

```powershell
npm install
npm run dev
```

Use Node.js 22.18 or newer. Add an OpenRouter API key in **Settings**. The key is encrypted with Electron `safeStorage` and held by the main process. Saving and reading credentials require asynchronous encryption availability. On Linux, unrecognized storage backends and the `basic_text` fallback are refused, so an OS secret store is required. Requests use OpenRouter's `openrouter/free` route, which selects an available free model; availability and limits can vary.

OpenRouter requests time out after 60 seconds, including response-body reading. Use Ctrl+1 (Command+1 on macOS) to return to the study desk, and the sidebar toggle to collapse or expand navigation. Recent questions is disabled and marked "Soon" until history is implemented.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run test:electron
```

Regression checks use fake storage and mocked HTTP responses; they do not use a real API key or contact OpenRouter.
The Electron smoke check runs the built app with a temporary data folder, verifies real OS encryption and the preload bridge, and checks navigation and sidebar controls. It requires secure OS key storage and an available desktop session. The temporary data is deleted when Electron exits.

## Current first slice

- React + TypeScript UI in the Electron renderer.
- Narrow typed preload bridge with context isolation, sandboxing, and Node integration disabled.
- User-selected screen/window capture and local crop selection.
- Encrypted local API-key storage and a main-process OpenRouter request.
- A study-coach prompt for practice and AI-permitted learning.

OCR, saved question history, streaming responses, Windows installer packaging, and a dedicated system-wide overlay are follow-up work.
