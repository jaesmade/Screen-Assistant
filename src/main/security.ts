// IPC is allowed only from the exact page loaded by the app. Navigation itself
// is blocked separately; matching a BrowserWindow alone does not confer trust.
export function isTrustedRendererUrl(
  candidate: string,
  expected: string,
): boolean {
  try {
    const actualUrl = new URL(candidate);
    const expectedUrl = new URL(expected);
    if (actualUrl.username || actualUrl.password) return false;
    if (expectedUrl.protocol === "file:") {
      return (
        actualUrl.protocol === "file:" &&
        actualUrl.host === expectedUrl.host &&
        actualUrl.pathname === expectedUrl.pathname &&
        actualUrl.search === expectedUrl.search
      );
    }
    return (
      ["http:", "https:"].includes(expectedUrl.protocol) &&
      actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      actualUrl.search === expectedUrl.search
    );
  } catch {
    return false;
  }
}
