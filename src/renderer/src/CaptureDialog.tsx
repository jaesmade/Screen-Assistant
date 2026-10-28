import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  Crop,
  LoaderCircle,
  Monitor,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";
import type { CaptureSource } from "../../shared/types";

export function CaptureDialog({
  onClose,
  onUse,
  forOcr = false,
}: {
  onClose: () => void;
  onUse: (image: string) => void;
  forOcr?: boolean;
}) {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    void window.studyAssistant
      .getCaptureSources()
      .then((items) => {
        setSources(items);
        if (items.length) setSelectedId(items[0].id);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function capture() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      setImage(await window.studyAssistant.captureSource(selectedId));
      setSelection(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not capture that screen.",
      );
    } finally {
      setBusy(false);
    }
  }

  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
    };
  }

  function beginSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    start.current = next;
    setSelection({ ...next, width: 0, height: 0 });
  }

  function moveSelection(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const next = point(event);
    const origin = start.current;
    setSelection({
      x: Math.min(origin.x, next.x),
      y: Math.min(origin.y, next.y),
      width: Math.abs(next.x - origin.x),
      height: Math.abs(next.y - origin.y),
    });
  }

  function endSelection() {
    start.current = null;
  }

  function cropImage() {
    const element = imageRef.current;
    if (
      !element ||
      !selection ||
      selection.width < 16 ||
      selection.height < 16
    ) {
      setError("Drag over the question to choose a larger crop area.");
      return;
    }
    const bounds = element.getBoundingClientRect();
    const scaleX = element.naturalWidth / bounds.width;
    const scaleY = element.naturalHeight / bounds.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(selection.width * scaleX);
    canvas.height = Math.round(selection.height * scaleY);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The crop could not be prepared.");
      return;
    }
    context.drawImage(
      element,
      selection.x * scaleX,
      selection.y * scaleY,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    onUse(canvas.toDataURL("image/jpeg", 0.88));
  }

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`capture-dialog ${image ? "capture-dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
      >
        <div className="dialog-top">
          <div>
            <span className="eyebrow">SCREEN CAPTURE</span>
            <h2 id="capture-title">
              {image ? "Crop the question" : "Choose what to capture"}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        {image ? (
          <>
            <p className="dialog-copy">
              Drag around only the question or diagram. The full screen stays on
              this device; only your crop is attached when you ask for help.
            </p>
            <div className="crop-stage">
              <div
                className="crop-image-wrap"
                onPointerDown={beginSelection}
                onPointerMove={moveSelection}
                onPointerUp={endSelection}
                onPointerCancel={endSelection}
              >
                <img
                  ref={imageRef}
                  src={image}
                  alt="Captured screen to crop"
                  draggable={false}
                />
                <div className="crop-shade" />
                {selection && (
                  <div
                    className="crop-selection"
                    style={{
                      left: selection.x,
                      top: selection.y,
                      width: selection.width,
                      height: selection.height,
                    }}
                  >
                    <span>
                      <Crop size={14} /> Selection
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="dialog-bottom">
              <button
                className="button button-quiet"
                onClick={() => {
                  setImage("");
                  setSelection(null);
                }}
              >
                <ArrowDown size={16} /> Choose another
              </button>
              <button className="button button-primary" onClick={cropImage}>
                <Crop size={16} />{" "}
                {forOcr ? "Extract text from crop" : "Use this crop"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog-copy">
              Pick a window or display. A screenshot is taken only after you
              press capture.
            </p>
            <div className="source-list">
              {sources.map((source) => (
                <button
                  key={source.id}
                  className={`source-option ${selectedId === source.id ? "source-selected" : ""}`}
                  onClick={() => setSelectedId(source.id)}
                >
                  <span className="source-icon">
                    <Monitor size={18} />
                  </span>
                  <span className="source-name">{source.name}</span>
                  {selectedId === source.id && (
                    <Check size={16} className="source-check" />
                  )}
                </button>
              ))}
              {sources.length === 0 && !error && (
                <div className="empty-state">
                  <LoaderCircle size={20} className="spin" /> Looking for
                  screens…
                </div>
              )}
              {sources.length === 0 && error && (
                <div className="empty-state">{error}</div>
              )}
            </div>
            <div className="dialog-bottom">
              <span className="privacy-note">
                <ShieldCheck size={15} /> Nothing is captured until you choose
              </span>
              <button
                className="button button-primary"
                onClick={() => void capture()}
                disabled={!selectedId || busy}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ScanLine size={16} />
                )}{" "}
                Capture selected
              </button>
            </div>
          </>
        )}
        {error && <div className="inline-error">{error}</div>}
      </section>
    </div>
  );
}
