import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  safeStorage,
  shell,
  nativeImage,
} from "electron";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createCredentialStore } from "./credentials";
import { REQUEST_CANCELLED_MESSAGE } from "./request";
import { streamChatCompletion } from "./stream";
import { isTrustedRendererUrl, externalHttpUrl } from "./security";
import { createHistoryStore } from "./history";
import { createOcrService, validateOcrImage, OCR_MAX_PIXELS } from "./ocr";
import { launchOcrProcess } from "./ocr-process";
import {
  desktopState,
  hideOverlay,
  isOverlayContents,
  keepInTray,
  setupDesktop,
  showDesk,
  showOverlay,
  withoutOverlay,
} from "./desktop";
import type {
  AssistantRequest,
  AssistantReply,
  CaptureSource,
} from "../shared/types";

const packagedTestDir = process.env.STUDY_DESK_PACKAGED_TEST_DIR;
if (packagedTestDir) {
  if (
    dirname(resolve(packagedTestDir)) !== resolve(tmpdir()) ||
    !basename(packagedTestDir).startsWith("study-desk-packaged-")
  )
    throw new Error("Invalid test data directory");
  app.setPath("userData", packagedTestDir);
} else if (!process.env.STUDY_DESK_SMOKE_DIR) {
  app.setPath(
    "userData",
    join(app.getPath("appData"), "screen-study-assistant"),
  );
}
app.setAppUserModelId("com.jaesmade.studydesk");
let mainWindow: BrowserWindow | null = null;
let ocrOwner: { contents: Electron.WebContents; id: string } | null = null;
const ocr = createOcrService(launchOcrProcess);
let activeRequest: {
  id: string;
  controller: AbortController;
  saving: boolean;
  owner: Electron.WebContents;
} | null = null;

function abortActiveRequest() {
  activeRequest?.controller.abort(new Error(REQUEST_CANCELLED_MESSAGE));
}

function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value))
    throw new Error("Choose a valid response request.");
  return value;
}

function assertFrame(
  event: Electron.IpcMainInvokeEvent,
  overlayAllowed = false,
) {
  if (
    !(
      event.sender === mainWindow?.webContents ||
      (overlayAllowed && isOverlayContents(event.sender))
    ) ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(event.senderFrame?.url ?? "", rendererUrl())
  ) {
    throw new Error("This request is not available from this window.");
  }
}
function assertMainFrame(event: Electron.IpcMainInvokeEvent) {
  assertFrame(event);
}
function assertStudyFrame(event: Electron.IpcMainInvokeEvent) {
  assertFrame(event, true);
}
function abortContents(contents: Electron.WebContents) {
  if (activeRequest?.owner === contents) abortActiveRequest();
  if (ocrOwner?.contents === contents) ocr.cancel(ocrOwner.id);
}

function rendererUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(join(__dirname, "../renderer/index.html")).href;
}

function registerIpc() {
  ipcMain.handle("desktop:show-overlay", (event) => {
    assertStudyFrame(event);
    showOverlay();
  });
  ipcMain.handle("desktop:hide-overlay", (event) => {
    assertStudyFrame(event);
    hideOverlay();
  });
  ipcMain.handle("desktop:show-desk", (event) => {
    assertStudyFrame(event);
    showDesk();
  });
  ipcMain.handle("desktop:state", (event) => {
    assertStudyFrame(event);
    return desktopState();
  });
  ipcMain.handle("ocr:recognize", async (event, data: unknown, id: unknown) => {
    assertStudyFrame(event);
    const taskId = requestId(id);
    const image = nativeImage.createFromDataURL(validateOcrImage(data));
    const { width, height } = image.getSize();
    if (image.isEmpty() || width < 16 || height < 16)
      throw new Error(
        "This crop could not be read. Choose a larger question area.",
      );
    if (width * height > OCR_MAX_PIXELS || width > 4096 || height > 4096)
      throw new Error(
        "This crop is too large for text extraction. Choose a smaller area.",
      );
    const scale = Math.min(2, 1600 / Math.max(width, height));
    const prepared =
      scale > 1
        ? image.resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            quality: "best",
          })
        : image;
    const frame = event.senderFrame;
    if (ocr.isBusy())
      throw new Error(
        "Text extraction is already in progress. Stop it before starting another.",
      );
    ocrOwner = { contents: event.sender, id: taskId };
    try {
      return await ocr.recognize(taskId, prepared.toPNG(), (progress) => {
        if (
          !event.sender.isDestroyed() &&
          frame === event.sender.mainFrame &&
          isTrustedRendererUrl(frame?.url ?? "", rendererUrl())
        ) {
          event.sender.send("ocr:progress", { requestId: taskId, ...progress });
        }
      });
    } finally {
      if (ocrOwner?.id === taskId && ocrOwner.contents === event.sender)
        ocrOwner = null;
    }
  });
  ipcMain.handle("ocr:cancel", async (event, id: unknown) => {
    assertStudyFrame(event);
    const taskId = requestId(id);
    return ocrOwner?.contents === event.sender && ocr.cancel(taskId);
  });
  ipcMain.handle(
    "assistant:cancel",
    async (event, id: unknown): Promise<boolean> => {
      assertStudyFrame(event);
      if (
        activeRequest?.id !== requestId(id) ||
        activeRequest.saving ||
        activeRequest.owner !== event.sender
      )
        return false;
      abortActiveRequest();
      return true;
    },
  );
  ipcMain.handle("links:open", async (event, url: unknown) => {
    assertStudyFrame(event);
    await shell.openExternal(externalHttpUrl(url));
  });
  const history = createHistoryStore(
    join(app.getPath("userData"), "question-history.json"),
  );
  function historyId(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) {
      throw new Error("Choose a valid saved question.");
    }
    return value;
  }
  ipcMain.handle("history:list", async (event) => {
    assertMainFrame(event);
    return history.list();
  });
  ipcMain.handle("history:get", async (event, id: unknown) => {
    assertMainFrame(event);
    return history.get(historyId(id));
  });
  ipcMain.handle("history:delete", async (event, id: unknown) => {
    assertMainFrame(event);
    await history.delete(historyId(id));
  });
  ipcMain.handle("history:clear", async (event) => {
    assertMainFrame(event);
    await history.clear();
  });
  const credentials = createCredentialStore(
    join(app.getPath("userData"), "openrouter-key.bin"),
    safeStorage,
  );
  ipcMain.handle("capture:list", async (event): Promise<CaptureSource[]> => {
    assertStudyFrame(event);
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    const ownSource = isOverlayContents(event.sender)
      ? BrowserWindow.fromWebContents(event.sender)?.getMediaSourceId()
      : undefined;
    return sources
      .filter((source) => source.id !== ownSource)
      .map(({ id, name }) => ({ id, name }));
  });

  ipcMain.handle("capture:take", async (event, sourceId: unknown) => {
    assertStudyFrame(event);
    if (typeof sourceId !== "string" || sourceId.length > 256)
      throw new Error("Choose a valid screen or window.");
    return withoutOverlay(event.sender, async () => {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 1440, height: 900 },
        fetchWindowIcons: false,
      });
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (!source || source.thumbnail.isEmpty())
        throw new Error(
          "That screen is no longer available. Please choose it again.",
        );
      return source.thumbnail.toDataURL();
    });
  });

  ipcMain.handle("settings:get", async (event) => {
    assertStudyFrame(event);
    return {
      hasApiKey: Boolean(await credentials.readKey()),
      encryptionAvailable: await credentials.isAvailable(),
    };
  });

  ipcMain.handle("settings:save-key", async (event, apiKey: unknown) => {
    assertMainFrame(event);
    if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 512) {
      throw new Error("Enter a valid OpenRouter API key.");
    }
    await credentials.saveKey(apiKey.trim());
  });

  ipcMain.handle("settings:clear-key", async (event) => {
    assertMainFrame(event);
    await credentials.clearKey();
  });

  ipcMain.handle(
    "assistant:ask",
    async (
      event,
      request: AssistantRequest,
      id?: unknown,
    ): Promise<AssistantReply> => {
      assertStudyFrame(event);
      if (!request || typeof request.question !== "string")
        throw new Error("Add a question or attach a screenshot.");
      if (request.question.length > 12_000)
        throw new Error("Please keep the question under 12,000 characters.");
      if (
        request.imageDataUrl &&
        (typeof request.imageDataUrl !== "string" ||
          request.imageDataUrl.length > 12_000_000 ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(request.imageDataUrl))
      ) {
        throw new Error(
          "The attached image is too large or is not a supported image.",
        );
      }
      if (!request.question.trim() && !request.imageDataUrl)
        throw new Error("Add a question or attach a screenshot.");

      const streamId = id === undefined ? randomUUID() : requestId(id);
      if (activeRequest)
        throw new Error(
          "A response is already in progress. Stop it before asking another question.",
        );
      const current = {
        id: streamId,
        controller: new AbortController(),
        saving: false,
        owner: event.sender,
      };
      activeRequest = current;
      const frame = event.senderFrame;
      let progress = { text: "", model: "openrouter/free" };
      let updateTimer: ReturnType<typeof setTimeout> | undefined;
      function flushProgress() {
        clearTimeout(updateTimer);
        updateTimer = undefined;
        if (
          !current.controller.signal.aborted &&
          activeRequest === current &&
          !event.sender.isDestroyed() &&
          frame === event.sender.mainFrame &&
          isTrustedRendererUrl(frame?.url ?? "", rendererUrl())
        ) {
          event.sender.send("assistant:update", {
            requestId: streamId,
            ...progress,
          });
        }
      }
      try {
        const apiKey = await credentials.readKey();
        current.controller.signal.throwIfAborted();
        if (!apiKey)
          throw new Error(
            "Add your OpenRouter API key in Settings before asking for help.",
          );

        // Snapshot the submitted input before awaiting network/storage work.
        const submitted = {
          question: request.question,
          imageDataUrl: request.imageDataUrl,
        };
        const prompt =
          request.question.trim() ||
          "Please read the attached cropped image and explain the question shown.";
        const content: Array<Record<string, unknown>> = [
          { type: "text", text: prompt },
        ];
        if (request.imageDataUrl) {
          content.push({
            type: "image_url",
            image_url: { url: request.imageDataUrl },
          });
        }

        const { text, model } = await streamChatCompletion(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "X-Title": "Screen Study Assistant",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              model: "openrouter/free",
              stream: true,
              temperature: 0.25,
              max_tokens: 1200,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a clear, patient study coach for practice and assessments where AI help is allowed. Explain the concept and show concise reasoning. Format explanations using Markdown, with $...$ for inline math and $$...$$ on separate lines for display math. Help the learner understand rather than silently completing work. If the learner says this is a live graded assessment where outside AI is not allowed, do not provide the answer; offer to explain the underlying topic for later study. Mention uncertainty when the screenshot is unclear.",
                },
                { role: "user", content },
              ],
            }),
          },
          (update) => {
            progress = update;
            // Coalesce rapid tokens so Markdown/math do not re-render per token.
            updateTimer ??= setTimeout(flushProgress, 40);
          },
          { signal: current.controller.signal },
        );
        current.controller.signal.throwIfAborted();
        current.saving = true;
        flushProgress();
        try {
          const id = await history.save({ ...submitted, answer: text, model });
          return { text, model, historyId: id };
        } catch {
          return {
            text,
            model,
            historyWarning:
              "Your explanation is ready, but it could not be saved to recent questions. Check history or clear it to start fresh.",
          };
        }
      } catch (error) {
        if (current.controller.signal.aborted)
          return { ...progress, cancelled: true };
        throw error;
      } finally {
        flushProgress();
        if (activeRequest === current) activeRequest = null;
      }
    },
  );
}

function configureWindow(window: BrowserWindow) {
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("did-start-loading", () => abortContents(contents));
  contents.on("render-process-gone", () => abortContents(contents));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-frame-navigate", (event) => event.preventDefault());
  contents.on("will-redirect", (event) => event.preventDefault());
  window.on("closed", () => abortContents(contents));
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#f5f6f9",
    title: "Study Desk",
    show: !packagedTestDir,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureWindow(mainWindow);
  mainWindow.on("close", (event) => {
    if (keepInTray()) {
      event.preventDefault();
      abortContents(mainWindow!.webContents);
      mainWindow!.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (
  packagedTestDir ||
  process.env.STUDY_DESK_SMOKE_DIR ||
  app.requestSingleInstanceLock()
)
  app.whenReady().then(async () => {
    registerIpc();
    createWindow();
    setupDesktop({
      configureWindow,
      abortOwned: (win) => abortContents(win.webContents),
      showMain: () => {
        if (!mainWindow) createWindow();
        if (mainWindow!.isMinimized()) mainWindow!.restore();
        mainWindow!.show();
        mainWindow!.focus();
      },
      rendererUrl,
    });
    app.on("second-instance", () => showDesk());
    if (packagedTestDir) {
      const { runPackagedSmoke } = await import("./packaged-smoke");
      void runPackagedSmoke(mainWindow!, packagedTestDir);
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
else app.quit();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", abortActiveRequest);
app.on("before-quit", () => ocr.cancel());
