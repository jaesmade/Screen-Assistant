import { contextBridge, ipcRenderer } from "electron";
import type { AssistantRequest } from "../shared/types";

contextBridge.exposeInMainWorld("studyAssistant", {
  getCaptureSources: () => ipcRenderer.invoke("capture:list"),
  captureSource: (sourceId: string) =>
    ipcRenderer.invoke("capture:take", sourceId),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveApiKey: (apiKey: string) =>
    ipcRenderer.invoke("settings:save-key", apiKey),
  clearApiKey: () => ipcRenderer.invoke("settings:clear-key"),
  askAssistant: (request: AssistantRequest) =>
    ipcRenderer.invoke("assistant:ask", request),
});
