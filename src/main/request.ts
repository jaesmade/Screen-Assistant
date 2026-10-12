export const REQUEST_TIMEOUT_MESSAGE =
  "OpenRouter took too long to respond. Please try again.";

// The deadline includes both the initial response and reading its body.
export async function fetchJsonWithTimeout(
  url: string,
  options: Omit<RequestInit, "signal">,
  timeoutMs = 60_000,
  fetcher: typeof fetch = fetch,
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(REQUEST_TIMEOUT_MESSAGE));
      controller.abort();
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await fetcher(url, {
      ...options,
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    return { response, payload };
  })();
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
