import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Crop,
  LoaderCircle,
  ScanText,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { AnswerMarkdown, CaptureDialog, OcrDialog } from "./LazyFeatures";
import { useAssistantResponse } from "./useAssistantResponse";

export default function Overlay() {
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [capture, setCapture] = useState<"image" | "ocr" | null>(null);
  const [ocr, setOcr] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const {
    answer,
    setAnswer,
    model,
    busy,
    notice,
    setNotice,
    savedId,
    setSavedId,
    stopping,
    incomplete,
    setIncomplete,
    submit,
    stopResponse,
  } = useAssistantResponse();
  useEffect(() => {
    const refresh = () => {
      void window.studyAssistant
        .getSettings()
        .then((settings) => setHasKey(settings.hasApiKey))
        .catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (ocr) return;
        if (capture) setCapture(null);
        else void window.studyAssistant.hideOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capture, ocr]);
  async function ask() {
    if (!confirmed) {
      setNotice({
        kind: "error",
        text: "Confirm this is practice or AI assistance is allowed.",
      });
      return;
    }
    await submit({ question, imageDataUrl: image || undefined });
  }
  return (
    <main className="overlay-shell">
      <header className="overlay-header">
        <span className="brand-mark">
          <Sparkles size={17} />
        </span>
        <div>
          <strong>Study Desk</strong>
          <span>Quick overlay</span>
        </div>
        <button
          className="icon-button"
          aria-label="Open study desk"
          title="Open study desk and settings"
          onClick={() => void window.studyAssistant.showDesk()}
        >
          <ArrowUpRight size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Hide overlay"
          onClick={() => void window.studyAssistant.hideOverlay()}
        >
          <X size={17} />
        </button>
      </header>
      <div className="overlay-intro">
        <span className="eyebrow">A LITTLE CLARITY, ANYWHERE</span>
        <h1>What are you working on?</h1>
        <p>Capture a question or type it below.</p>
      </div>
      <label className="field-label" htmlFor="overlay-question">
        Question or topic
      </label>
      <textarea
        id="overlay-question"
        className="overlay-question"
        maxLength={12000}
        disabled={busy}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="Type or paste your question…"
        rows={4}
      />
      <div className="overlay-tools">
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() => setCapture("image")}
        >
          <Crop size={15} /> Capture crop
        </button>
        <button
          className="button button-quiet"
          disabled={busy}
          onClick={() => {
            if (image) setOcr(image);
            else setCapture("ocr");
          }}
        >
          <ScanText size={15} /> Extract text
        </button>
        {image && (
          <span className="overlay-attachment">
            <img src={image} alt="Attached question crop" />
            <button
              aria-label="Remove overlay screenshot"
              disabled={busy}
              onClick={() => setImage("")}
            >
              <X size={13} />
            </button>
          </span>
        )}
      </div>
      <label className="overlay-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>I’m practicing or AI help is allowed.</span>
      </label>
      <div className="overlay-submit">
        <button
          className="button button-primary"
          disabled={busy || (!question.trim() && !image)}
          onClick={() => void ask()}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Send size={14} />
          )}{" "}
          {busy ? "Writing…" : "Help me understand"}
        </button>
        {busy && (
          <button
            className="button button-quiet"
            disabled={stopping}
            onClick={() => void stopResponse()}
          >
            <Square size={12} /> {stopping ? "Stopping…" : "Stop"}
          </button>
        )}
        {!hasKey && (
          <button
            className="overlay-key"
            onClick={() => void window.studyAssistant.showDesk()}
          >
            Add a key in Settings <ArrowUpRight size={11} />
          </button>
        )}
      </div>
      {notice && (
        <div
          className={
            notice.kind === "error" ? "inline-error" : "overlay-notice"
          }
          role="status"
        >
          {notice.text}
        </div>
      )}
      <section className="overlay-answer" aria-busy={busy}>
        {answer ? (
          <>
            <div className="overlay-answer-label">
              <Sparkles size={13} />
              {busy
                ? "Writing explanation"
                : incomplete
                  ? "Partial explanation"
                  : "Explanation"}
            </div>
            <AnswerMarkdown text={answer} />
            <footer>
              {model}
              <span>
                {savedId ? (
                  <>
                    <Check size={11} /> Saved locally
                  </>
                ) : busy ? (
                  "Receiving…"
                ) : incomplete ? (
                  "Not saved"
                ) : (
                  ""
                )}
              </span>
            </footer>
          </>
        ) : (
          <div className="overlay-empty">
            <Sparkles size={26} />
            <p>
              {busy
                ? "Finding a clear way to explain it…"
                : "Your explanation will appear here."}
            </p>
          </div>
        )}
      </section>
      <footer className="overlay-footer">
        <span>Ctrl+Shift+Space · show / hide</span>
        <span>Esc · hide</span>
      </footer>
      {capture && (
        <CaptureDialog
          forOcr={capture === "ocr"}
          onClose={() => setCapture(null)}
          onUse={(crop) => {
            if (capture === "ocr") setOcr(crop);
            else setImage(crop);
            setCapture(null);
          }}
        />
      )}
      {ocr && (
        <OcrDialog
          image={ocr}
          question={question}
          onClose={() => setOcr(null)}
          onRecapture={() => {
            setOcr(null);
            setCapture("ocr");
          }}
          onUse={(text, keepCrop) => {
            setQuestion(text);
            setImage(keepCrop ? ocr : "");
            setOcr(null);
            setAnswer("");
            setSavedId(null);
            setIncomplete(false);
            setNotice(null);
          }}
        />
      )}
    </main>
  );
}
