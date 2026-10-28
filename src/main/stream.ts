import { createParser } from "eventsource-parser";
import { withRequestDeadline } from "./request.ts";

type StreamProgress = { text: string; model: string };
type StreamChunk = {
  model?: unknown;
  error?: { message?: unknown };
  choices?: Array<{
    index?: number;
    delta?: { content?: unknown };
    finish_reason?: string | null;
  }>;
};

const INVALID_STREAM =
  "OpenRouter sent an invalid response stream. Please try again.";
const INTERRUPTED_STREAM =
  "The connection ended before the explanation finished. The partial response was not saved. Please try again.";

export async function streamChatCompletion(
  url: string,
  options: Omit<RequestInit, "signal">,
  onProgress: (progress: StreamProgress) => void,
  {
    signal,
    timeoutMs = 60_000,
    fetcher = fetch,
  }: {
    signal?: AbortSignal;
    timeoutMs?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<StreamProgress> {
  return withRequestDeadline(
    async (requestSignal) => {
      const response = await fetcher(url, {
        ...options,
        signal: requestSignal,
      });
      requestSignal.throwIfAborted();
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        const payload = (await response
          .json()
          .catch(() => null)) as StreamChunk | null;
        requestSignal.throwIfAborted();
        throw new Error(
          typeof payload?.error?.message === "string"
            ? payload.error.message
            : !response.ok
              ? `OpenRouter returned an error (${response.status}).`
              : "OpenRouter did not return a streaming response. Please try again.",
        );
      }
      if (!response.body) throw new Error(INTERRUPTED_STREAM);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let model = "openrouter/free";
      let done = false;
      let bytes = 0;
      const parser = createParser({
        maxBufferSize: 512 * 1024,
        onError(error) {
          if (error.type === "max-buffer-size-exceeded")
            throw new Error(INVALID_STREAM);
        },
        onEvent(event) {
          if (done) return;
          requestSignal.throwIfAborted();
          if (event.data === "[DONE]") {
            done = true;
            return;
          }
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(event.data);
          } catch {
            throw new Error(INVALID_STREAM);
          }
          if (!chunk || typeof chunk !== "object")
            throw new Error(INVALID_STREAM);
          if (chunk.choices !== undefined && !Array.isArray(chunk.choices))
            throw new Error(INVALID_STREAM);
          if (chunk.error)
            throw new Error(
              typeof chunk.error.message === "string"
                ? chunk.error.message
                : "The model could not finish the explanation.",
            );
          const choice =
            chunk.choices?.find((item) => item?.index === 0) ??
            chunk.choices?.[0];
          const previousModel = model;
          if (
            typeof chunk.model === "string" &&
            chunk.model.length <= 512 &&
            chunk.model
          )
            model = chunk.model;
          const delta = choice?.delta?.content;
          if (
            delta !== undefined &&
            delta !== null &&
            typeof delta !== "string"
          )
            throw new Error(INVALID_STREAM);
          if (typeof delta === "string") text += delta;
          if (text.length > 200_000)
            throw new Error(
              "The explanation is too large to display. Try a shorter question.",
            );
          if (delta || model !== previousModel) onProgress({ text, model });
          if (choice?.finish_reason && choice.finish_reason !== "stop") {
            throw new Error(
              choice.finish_reason === "length"
                ? "The model reached its output limit. The partial explanation was not saved. Try a shorter question."
                : "The model could not finish the explanation. The partial response was not saved. Please try again.",
            );
          }
        },
      });
      const cancelReader = () => {
        void reader.cancel().catch(() => {});
      };
      requestSignal.addEventListener("abort", cancelReader, { once: true });
      try {
        requestSignal.throwIfAborted();
        while (!done) {
          const next = await reader.read();
          requestSignal.throwIfAborted();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 4 * 1024 * 1024)
            throw new Error(
              "The response stream is too large. Please try again.",
            );
          parser.feed(decoder.decode(next.value, { stream: true }));
        }
        if (!done) throw new Error(INTERRUPTED_STREAM);
        if (!text.trim())
          throw new Error(
            "The model returned an empty response. Please try again.",
          );
        return { text, model };
      } finally {
        requestSignal.removeEventListener("abort", cancelReader);
        cancelReader();
        reader.releaseLock();
      }
    },
    { signal, timeoutMs },
  );
}
