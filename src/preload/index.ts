import { contextBridge, ipcRenderer } from "electron";
import type {
  AssistantRequest,
  AssistantStreamUpdate,
  OcrProgress,
} from "../shared/types";

contextBridge.exposeInMainWorld("studyAssistant", {
  showOverlay: () => ipcRenderer.invoke("desktop:show-overlay"),
  hideOverlay: () => ipcRenderer.invoke("desktop:hide-overlay"),
  showDesk: () => ipcRenderer.invoke("desktop:show-desk"),
  getDesktopState: () => ipcRenderer.invoke("desktop:state"),
  recognizeText: (imageDataUrl: string, requestId: string) =>
    ipcRenderer.invoke("ocr:recognize", imageDataUrl, requestId),
  cancelOcr: (requestId: string) => ipcRenderer.invoke("ocr:cancel", requestId),
  onOcrProgress: (callback: (progress: OcrProgress) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: OcrProgress,
    ) => callback(progress);
    ipcRenderer.on("ocr:progress", listener);
    return () => {
      ipcRenderer.removeListener("ocr:progress", listener);
    };
  },
  getCaptureSources: () => ipcRenderer.invoke("capture:list"),
  captureSource: (sourceId: string) =>
    ipcRenderer.invoke("capture:take", sourceId),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveApiKey: (apiKey: string) =>
    ipcRenderer.invoke("settings:save-key", apiKey),
  clearApiKey: () => ipcRenderer.invoke("settings:clear-key"),
  askAssistant: (request: AssistantRequest, requestId?: string) =>
    ipcRenderer.invoke("assistant:ask", request, requestId),
  onAssistantUpdate: (callback: (update: AssistantStreamUpdate) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      update: AssistantStreamUpdate,
    ) => callback(update);
    ipcRenderer.on("assistant:update", listener);
    return () => {
      ipcRenderer.removeListener("assistant:update", listener);
    };
  },
  cancelAssistant: (requestId: string) =>
    ipcRenderer.invoke("assistant:cancel", requestId),
  getHistory: () => ipcRenderer.invoke("history:list"),
  getHistoryEntry: (id: string) => ipcRenderer.invoke("history:get", id),
  deleteHistoryEntry: (id: string) => ipcRenderer.invoke("history:delete", id),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  openExternalLink: (url: string) => ipcRenderer.invoke("links:open", url),
});
