import type { OcrProgress, OcrReply } from "../shared/types";

export const OCR_TIMEOUT_MESSAGE =
  "Text extraction took too long. Try a smaller or clearer crop.";
export const OCR_MAX_PIXELS = 8_000_000;
type Progress = Omit<OcrProgress, "requestId">;
export type OcrJob = { result: Promise<unknown>; terminate: () => void };

export function validateOcrImage(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 12_000_000 ||
    !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value) ||
    value.slice(value.indexOf(",") + 1).length % 4 !== 0
  ) {
    throw new Error(
      "Choose a valid PNG, JPEG, or WebP question crop under 12 MB.",
    );
  }
  return value;
}

export function createOcrService(
  launch: (
    image: Uint8Array,
    onProgress: (progress: Progress) => void,
  ) => OcrJob,
  timeoutMs = 120_000,
) {
  let active: { id: string; cancel: () => void; cancelled: boolean } | null =
    null;
  return {
    isBusy: () => Boolean(active && !active.cancelled),
    cancel(id?: string): boolean {
      if (!active || active.cancelled || (id !== undefined && active.id !== id))
        return false;
      active.cancelled = true;
      active.cancel();
      return true;
    },
    async recognize(
      id: string,
      image: Uint8Array,
      onProgress: (progress: Progress) => void,
    ): Promise<OcrReply> {
      if (active && !active.cancelled)
        throw new Error(
          "Text extraction is already in progress. Stop it before starting another.",
        );
      let interrupt: (reason: Error) => void = () => {};
      const interruption = new Promise<never>((_, reject) => {
        interrupt = reject;
      });
      const current = {
        id,
        cancelled: false,
        cancel: () => interrupt(new Error("Text extraction stopped.")),
      };
      active = current;
      const timer = setTimeout(
        () => interrupt(new Error(OCR_TIMEOUT_MESSAGE)),
        timeoutMs,
      );
      let job: OcrJob | undefined;
      let settled = false;
      try {
        job = launch(image, (progress) => {
          if (settled || current.cancelled || active !== current) return;
          if (
            !progress ||
            !["loading", "recognizing"].includes(progress.stage) ||
            !Number.isFinite(progress.progress)
          )
            return;
          onProgress({
            stage: progress.stage,
            progress: Math.min(1, Math.max(0, progress.progress)),
          });
        });
        const result = (await Promise.race([
          job.result,
          interruption,
        ])) as OcrReply;
        if (
          !result ||
          typeof result.text !== "string" ||
          result.text.length > 100_000 ||
          typeof result.confidence !== "number" ||
          !Number.isFinite(result.confidence)
        ) {
          throw new Error(
            "Text extraction returned an invalid result. Please try again.",
          );
        }
        return {
          text: result.text.replace(/\r\n?/g, "\n").trim(),
          confidence: Math.min(100, Math.max(0, result.confidence)),
        };
      } catch (error) {
        if (current.cancelled)
          return { text: "", confidence: 0, cancelled: true };
        throw error;
      } finally {
        settled = true;
        clearTimeout(timer);
        try {
          job?.terminate();
        } finally {
          if (active === current) active = null;
        }
      }
    },
  };
}
