import { app, utilityProcess } from "electron";
import { join } from "node:path";
import type { OcrJob } from "./ocr";
import type { OcrProgress } from "../shared/types";

export function launchOcrProcess(
  image: Uint8Array,
  onProgress: (progress: Omit<OcrProgress, "requestId">) => void,
): OcrJob {
  const workerPath = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked/out/main/ocr-worker.js")
    : join(__dirname, "ocr-worker.js");
  const child = utilityProcess.fork(workerPath, [], {
    serviceName: "Study Desk OCR",
    stdio: process.env.STUDY_DESK_PACKAGED_TEST_DIR ? "pipe" : "ignore",
  });
  let diagnostic = "";
  child.stderr?.on("data", (chunk) => {
    diagnostic = (diagnostic + String(chunk)).slice(-4000);
  });
  let terminated = false;
  const result = new Promise<unknown>((resolve, reject) => {
    const fail = () =>
      reject(
        new Error(
          "Local text recognition could not finish. Try a clearer crop or restart the app." +
            (process.env.STUDY_DESK_PACKAGED_TEST_DIR ? ` ${diagnostic}` : ""),
        ),
      );
    child.once("spawn", () => {
      if (terminated) {
        child.kill();
        return;
      }
      try {
        child.postMessage({ image });
      } catch {
        fail();
      }
    });
    child.on("message", (message) => {
      if (terminated || !message || typeof message !== "object") return;
      if (message.type === "progress") onProgress(message.progress);
      else if (message.type === "result") resolve(message.result);
      else if (message.type === "error") fail();
    });
    child.on("error", fail);
    child.once("exit", () => {
      fail();
      child.removeAllListeners();
    });
  });
  return {
    result,
    terminate() {
      terminated = true;
      child.kill();
    },
  };
}
