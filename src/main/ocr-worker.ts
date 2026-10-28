import { createWorker, OEM } from "tesseract.js";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

// All engine code and language data come from installed dependencies. Never
// fall back to a CDN or write an image/language cache into the working folder.
const { langPath: baseLangPath, gzip } = require("@tesseract.js-data/eng") as {
  langPath: string;
  gzip: boolean;
};
const langPath = join(baseLangPath, "../4.0.0_best_int");
process.parentPort.once("message", async ({ data }) => {
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    if (
      !isAbsolute(langPath) ||
      !existsSync(join(langPath, "eng.traineddata.gz"))
    )
      throw new Error("Missing language data");
    if (!(data?.image instanceof Uint8Array)) throw new Error("Invalid image");
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      langPath,
      gzip,
      cacheMethod: "none",
      logger(message) {
        process.parentPort.postMessage({
          type: "progress",
          progress: {
            stage:
              message.status === "recognizing text" ? "recognizing" : "loading",
            progress:
              message.status === "recognizing text" ? message.progress : 0,
          },
        });
      },
    });
    const { data: result } = await worker.recognize(Buffer.from(data.image));
    process.parentPort.postMessage({
      type: "result",
      result: { text: result.text, confidence: result.confidence },
    });
  } catch {
    process.parentPort.postMessage({ type: "error" });
  } finally {
    await worker?.terminate();
  }
});
