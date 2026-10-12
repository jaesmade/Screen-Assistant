export type CaptureSource = {
  id: string;
  name: string;
};

export type AppSettings = {
  hasApiKey: boolean;
  encryptionAvailable: boolean;
};

export type AssistantRequest = {
  question: string;
  imageDataUrl?: string;
};

export type AssistantReply = {
  text: string;
  model: string;
};

export type DesktopApi = {
  getCaptureSources: () => Promise<CaptureSource[]>;
  captureSource: (sourceId: string) => Promise<string>;
  getSettings: () => Promise<AppSettings>;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  askAssistant: (request: AssistantRequest) => Promise<AssistantReply>;
};
