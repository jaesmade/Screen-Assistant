import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { memo } from "react";

export const AnswerMarkdown = memo(function AnswerMarkdown({
  text,
}: {
  text: string;
}) {
  return (
    <div className="answer-text">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            { trust: false, strict: "ignore", maxExpand: 1000, maxSize: 20 },
          ],
        ]}
        components={{
          // Model-authored content must not load remote assets or navigate the app.
          img: ({ alt }) => (
            <span className="answer-image-alt">{alt || "Image omitted"}</span>
          ),
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                className="answer-link"
                href={href}
                title="Open in your browser"
                onClick={(event) => {
                  event.preventDefault();
                  void window.studyAssistant
                    .openExternalLink(href)
                    .catch(() => {});
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          table: ({ children }) => (
            <div className="answer-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
});
