import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  safeStorage,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCredentialStore } from "./credentials";
import { fetchJsonWithTimeout } from "./request";
import { isTrustedRendererUrl } from "./security";
import type {
  AssistantRequest,
  AssistantReply,
  CaptureSource,
} from "../shared/types";

let mainWindow: BrowserWindow | null = null;

function assertMainFrame(event: Electron.IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(event.senderFrame?.url ?? "", rendererUrl())
  ) {
    throw new Error("This request is not available from this window.");
  }
}

function rendererUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(join(__dirname, "../renderer/index.html")).href;
}

function registerIpc() {
  const credentials = createCredentialStore(
    join(app.getPath("userData"), "openrouter-key.bin"),
    safeStorage,
  );
  ipcMain.handle("capture:list", async (event): Promise<CaptureSource[]> => {
    assertMainFrame(event);
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return sources.map(({ id, name }) => ({ id, name }));
  });

  ipcMain.handle("capture:take", async (event, sourceId: unknown) => {
    assertMainFrame(event);
    if (typeof sourceId !== "string" || sourceId.length > 256)
      throw new Error("Choose a valid screen or window.");
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

  ipcMain.handle("settings:get", async (event) => {
    assertMainFrame(event);
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
    async (event, request: AssistantRequest): Promise<AssistantReply> => {
      assertMainFrame(event);
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

      const apiKey = await credentials.readKey();
      if (!apiKey)
        throw new Error(
          "Add your OpenRouter API key in Settings before asking for help.",
        );

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

      const { response, payload: responsePayload } = await fetchJsonWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "Screen Study Assistant",
          },
          body: JSON.stringify({
            model: "openrouter/free",
            temperature: 0.25,
            max_tokens: 1200,
            messages: [
              {
                role: "system",
                content:
                  "You are a clear, patient study coach for practice and assessments where AI help is allowed. Explain the concept and show concise reasoning. Help the learner understand rather than silently completing work. If the learner says this is a live graded assessment where outside AI is not allowed, do not provide the answer; offer to explain the underlying topic for later study. Mention uncertainty when the screenshot is unclear.",
              },
              { role: "user", content },
            ],
          }),
        },
      );

      const payload = responsePayload as {
        error?: { message?: string };
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
        model?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            `OpenRouter returned an error (${response.status}).`,
        );
      }
      const rawContent = payload?.choices?.[0]?.message?.content;
      const text =
        typeof rawContent === "string"
          ? rawContent
          : rawContent
              ?.map((part) => part.text || "")
              .join("\n")
              .trim();
      if (!text)
        throw new Error(
          "The model returned an empty response. Please try again.",
        );
      return { text, model: payload?.model || "openrouter/free" };
    },
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#f5f6f9",
    title: "Study Desk",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // This app changes views in React and never needs document navigation.
  // Initial programmatic loadURL/loadFile calls do not emit will-navigate.
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("will-frame-navigate", (event) =>
    event.preventDefault(),
  );
  mainWindow.webContents.on("will-redirect", (event) => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
