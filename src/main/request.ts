export const REQUEST_TIMEOUT_MESSAGE =
  "OpenRouter took too long to respond. Please try again.";
export const REQUEST_CANCELLED_MESSAGE = "Response stopped.";

// Race the deadline and caller cancellation as well as passing the signal to
// fetch. This also bounds a stalled response reader or a non-cooperative fetch.
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  {
    timeoutMs = 60_000,
    signal,
  }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interruption = new Promise<never>((_, reject) => {
    onAbort = () => {
      const reason =
        signal?.reason instanceof Error
          ? signal.reason
          : new Error(REQUEST_CANCELLED_MESSAGE);
      reject(reason);
      controller.abort(reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      const reason = new Error(REQUEST_TIMEOUT_MESSAGE);
      reject(reason);
      controller.abort(reason);
    }, timeoutMs);
  });
  try {
    const work = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    });
    return await Promise.race([work, interruption]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

// The deadline includes both the initial response and reading its body.
export async function fetchJsonWithTimeout(
  url: string,
  options: Omit<RequestInit, "signal">,
  timeoutMs = 60_000,
  fetcher: typeof fetch = fetch,
): Promise<{ response: Response; payload: unknown }> {
  return withRequestDeadline(
    async (signal) => {
      const response = await fetcher(url, {
        ...options,
        signal,
      });
      const payload: unknown = await response.json().catch((error: unknown) => {
        if (signal.aborted) throw error;
        return null;
      });
      return { response, payload };
    },
    { timeoutMs },
  );
}
