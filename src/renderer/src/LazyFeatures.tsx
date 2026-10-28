import { lazy, Suspense } from "react";
const Markdown = lazy(() =>
  import("./AnswerMarkdown").then((module) => ({
    default: module.AnswerMarkdown,
  })),
);
export function AnswerMarkdown({ text }: { text: string }) {
  return (
    <Suspense
      fallback={<p className="feature-loading">Formatting explanation…</p>}
    >
      <Markdown text={text} />
    </Suspense>
  );
}
export const HistoryPage = lazy(() =>
  import("./HistoryPage").then((module) => ({ default: module.HistoryPage })),
);
export const OcrDialog = lazy(() =>
  import("./OcrDialog").then((module) => ({ default: module.OcrDialog })),
);
export const CaptureDialog = lazy(() =>
  import("./CaptureDialog").then((module) => ({
    default: module.CaptureDialog,
  })),
);
