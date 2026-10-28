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
  historyId?: string;
  historyWarning?: string;
  cancelled?: boolean;
};

export type AssistantStreamUpdate = {
  requestId: string;
  text: string;
  model: string;
};

export type OcrReply = {
  text: string;
  confidence: number;
  cancelled?: boolean;
};
export type OcrProgress = {
  requestId: string;
  stage: "loading" | "recognizing";
  progress: number;
};

export type QuestionHistoryEntry = {
  id: string;
  createdAt: string;
  question: string;
  imageDataUrl?: string;
  answer: string;
  model: string;
};

export type QuestionHistorySummary = Omit<
  QuestionHistoryEntry,
  "imageDataUrl" | "answer"
> & {
  preview: string;
  hasImage: boolean;
};

export type DesktopApi = {
  showOverlay: () => Promise<void>;
  hideOverlay: () => Promise<void>;
  showDesk: () => Promise<void>;
  getDesktopState: () => Promise<{
    shortcut: string;
    shortcutRegistered: boolean;
    overlayVisible: boolean;
  }>;
  recognizeText: (imageDataUrl: string, requestId: string) => Promise<OcrReply>;
  onOcrProgress: (callback: (progress: OcrProgress) => void) => () => void;
  cancelOcr: (requestId: string) => Promise<boolean>;
  getCaptureSources: () => Promise<CaptureSource[]>;
  captureSource: (sourceId: string) => Promise<string>;
  getSettings: () => Promise<AppSettings>;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  askAssistant: (
    request: AssistantRequest,
    requestId?: string,
  ) => Promise<AssistantReply>;
  onAssistantUpdate: (
    callback: (update: AssistantStreamUpdate) => void,
  ) => () => void;
  cancelAssistant: (requestId: string) => Promise<boolean>;
  getHistory: () => Promise<QuestionHistorySummary[]>;
  getHistoryEntry: (id: string) => Promise<QuestionHistoryEntry | null>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  openExternalLink: (url: string) => Promise<void>;
};
