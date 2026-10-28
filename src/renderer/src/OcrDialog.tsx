import { useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";

export function OcrDialog({
  image,
  question,
  onClose,
  onRecapture,
  onUse,
}: {
  image: string;
  question: string;
  onClose: () => void;
  onRecapture: () => void;
  onUse: (text: string, keepCrop: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [stage, setStage] = useState<"loading" | "recognizing">("loading");
  const [progress, setProgress] = useState(0);
  const [keepCrop, setKeepCrop] = useState(false);
  const active = useRef<string | null>(null);
  const dialog = useRef<HTMLElement>(null);

  async function recognize() {
    if (active.current) return;
    const id = crypto.randomUUID();
    active.current = id;
    setBusy(true);
    setStopping(false);
    setStopped(false);
    setError("");
    setText("");
    setConfidence(null);
    setStage("loading");
    setProgress(0);
    try {
      const result = await window.studyAssistant.recognizeText(image, id);
      if (active.current !== id) return;
      if (result.cancelled) setStopped(true);
      else if (!result.text.trim())
        setError("No text found. Try a tighter crop or larger, clearer text.");
      else {
        setText(result.text);
        setConfidence(result.confidence);
      }
    } catch (reason) {
      if (active.current === id)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not extract text. Try another crop.",
        );
    } finally {
      if (active.current === id) {
        active.current = null;
        setBusy(false);
        setStopping(false);
      }
    }
  }

  useEffect(() => {
    const unsubscribe = window.studyAssistant.onOcrProgress((update) => {
      if (active.current !== update.requestId) return;
      setStage(update.stage);
      setProgress(update.progress);
    });
    void recognize();
    return () => {
      unsubscribe();
      const id = active.current;
      active.current = null;
      if (id) void window.studyAssistant.cancelOcr(id).catch(() => {});
    };
  }, [image]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>(".ocr-close")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)",
        ) || [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [onClose]);

  async function stop() {
    const id = active.current;
    if (!id || stopping) return;
    setStopping(true);
    try {
      await window.studyAssistant.cancelOcr(id);
    } catch {
      if (active.current === id) {
        setError("Could not stop text extraction. Try closing this dialog.");
        setStopping(false);
      }
    }
  }

  const replacement = text.trim();
  const appended = [question.trim(), replacement].filter(Boolean).join("\n\n");
  const usable =
    !busy && replacement.length > 0 && replacement.length <= 12_000;
  return (
    <div className="modal-scrim">
      <section
        ref={dialog}
        className="ocr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-title"
        aria-describedby="ocr-description"
      >
        <div className="dialog-top">
          <div>
            <span className="eyebrow">LOCAL TEXT RECOGNITION</span>
            <h2 id="ocr-title">Extract and review text</h2>
          </div>
          <button
            className="icon-button ocr-close"
            aria-label="Close text extraction"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p id="ocr-description" className="dialog-copy">
          Read text from your crop, then correct anything that looks off. No API
          key or upload is needed for extraction.
        </p>
        <div className="ocr-workspace">
          <div className="ocr-source">
            <span className="field-label">Question crop</span>
            <div className="ocr-image">
              <img src={image} alt="Crop used for text recognition" />
            </div>
            <button className="button button-quiet" onClick={onRecapture}>
              <Crop size={14} /> Choose another crop
            </button>
            <p>English printed text. Check equations and symbols carefully.</p>
          </div>
          <div className="ocr-review">
            <div className="ocr-review-heading">
              <label className="field-label" htmlFor="ocr-text">
                Review extracted text
              </label>
              {confidence !== null && (
                <span className="ocr-confidence">
                  {Math.round(confidence)}% confidence
                </span>
              )}
            </div>
            {busy && (
              <div className="ocr-progress" role="status">
                <span>
                  <LoaderCircle size={14} className="spin" />{" "}
                  {stage === "loading"
                    ? "Preparing local recognition…"
                    : `Reading text… ${Math.round(progress * 100)}%`}
                </span>
                <progress
                  aria-label="Text extraction progress"
                  max={1}
                  value={stage === "recognizing" ? progress : undefined}
                />
              </div>
            )}
            <textarea
              id="ocr-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={busy}
              placeholder={
                busy
                  ? "Extracted text will appear here…"
                  : "Review and edit the recognized text here."
              }
              spellCheck={false}
            />
            <div
              className={`ocr-character-count ${replacement.length > 12_000 ? "ocr-over-limit" : ""}`}
            >
              {replacement.length.toLocaleString()} / 12,000 characters
              {replacement.length > 12_000 && " · Shorten the text to use it"}
            </div>
            {confidence !== null && confidence < 70 && (
              <p className="ocr-caution">
                Some text may be inaccurate. Compare it with the crop before
                using it.
              </p>
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
            {stopped && (
              <div className="ocr-stopped" role="status">
                Text extraction stopped. You can try again.
              </div>
            )}
            {!busy && (error || stopped) && (
              <button
                className="button button-quiet ocr-retry"
                onClick={() => void recognize()}
              >
                <RefreshCw size={14} /> Try again
              </button>
            )}
          </div>
        </div>
        <label className="ocr-attach-option">
          <input
            type="checkbox"
            checked={keepCrop}
            onChange={(event) => setKeepCrop(event.target.checked)}
          />
          <span>Also attach this crop when I ask for an explanation</span>
        </label>
        <div className="dialog-bottom">
          <span className="privacy-note">
            <ShieldCheck size={15} />{" "}
            {keepCrop
              ? "Text and crop will be attached to your question"
              : "Only the reviewed text will be used"}
          </span>
          <div className="ocr-actions">
            {busy ? (
              <button
                className="button button-quiet"
                disabled={stopping}
                onClick={() => void stop()}
              >
                <Square size={13} />{" "}
                {stopping ? "Stopping…" : "Stop extraction"}
              </button>
            ) : (
              <>
                {question.trim() && (
                  <button
                    className="button button-quiet ocr-append"
                    disabled={!usable || appended.length > 12_000}
                    title={
                      appended.length > 12_000
                        ? "Combined question exceeds 12,000 characters"
                        : "Add below your current question"
                    }
                    onClick={() => onUse(appended, keepCrop)}
                  >
                    <FileText size={14} /> Append text
                  </button>
                )}
                <button
                  className="button button-primary ocr-use"
                  disabled={!usable}
                  onClick={() => onUse(replacement, keepCrop)}
                >
                  <Check size={15} />{" "}
                  {question.trim() ? "Replace question" : "Use text"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
