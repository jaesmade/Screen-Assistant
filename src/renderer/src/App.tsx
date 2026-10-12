import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crop,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { AppSettings, CaptureSource } from "../../shared/types";

type Notice = { kind: "error" | "success"; text: string };

function StudyMark() {
  return (
    <span className="brand-mark">
      <Sparkles size={17} strokeWidth={2.2} />
    </span>
  );
}

function CaptureDialog({
  onClose,
  onUse,
}: {
  onClose: () => void;
  onUse: (image: string) => void;
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
                <Crop size={16} /> Use this crop
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

function SettingsPage({
  settings,
  onBack,
  onChanged,
}: {
  settings: AppSettings | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function save() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await window.studyAssistant.saveApiKey(apiKey);
      setApiKey("");
      await onChanged();
      setSuccess("API key saved securely on this device.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save the key.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await window.studyAssistant.clearApiKey();
      await onChanged();
      setSuccess("Saved key removed.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove the key.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="main-content settings-content">
      <button className="back-link" onClick={onBack}>
        ← Back to study desk
      </button>
      <div className="page-heading">
        <span className="eyebrow">PREFERENCES</span>
        <h1>Settings</h1>
        <p>
          Connect your model provider. Your key is encrypted and stored on this
          device.
        </p>
      </div>
      <section className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-icon">
            <KeyRound size={19} />
          </div>
          <div>
            <h2>OpenRouter</h2>
            <p>Free model routing for explanations</p>
          </div>
          <span
            className={`connection-pill ${settings?.hasApiKey ? "connected" : ""}`}
          >
            <i />
            {settings?.hasApiKey ? "Key saved" : "No key saved"}
          </span>
        </div>
        {!settings?.encryptionAvailable && (
          <div className="inline-error settings-alert">
            Secure key storage is unavailable on this system. The app will not
            save the key.
          </div>
        )}
        <label className="field-label" htmlFor="api-key">
          API key
        </label>
        <div className="key-input-row">
          <input
            id="api-key"
            type="password"
            placeholder={
              settings?.hasApiKey
                ? "A key is saved. Enter a new one to replace it."
                : "sk-or-v1-…"
            }
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
          />
          <button
            className="button button-primary"
            onClick={() => void save()}
            disabled={!apiKey.trim() || busy || !settings?.encryptionAvailable}
          >
            {busy ? "Saving…" : "Save key"}
          </button>
        </div>
        <div className="settings-footnote">
          <ShieldCheck size={15} /> Saved keys are encrypted locally and are
          never shown again.
        </div>
        <button
          className="remove-key"
          disabled={busy}
          onClick={() => void clear()}
        >
          <Trash2 size={15} /> Remove saved key
        </button>
        {error && <div className="inline-error">{error}</div>}
        {success && <div className="inline-success">{success}</div>}
      </section>
      <div className="settings-model">
        <span className="model-dot" />
        <div>
          <strong>Current route</strong>
          <span>
            openrouter/free <small>· chooses an available free model</small>
          </span>
        </div>
        <ArrowUpRight size={16} />
      </div>
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState<"desk" | "settings">("desk");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [image, setImage] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function refreshSettings() {
    setSettings(await window.studyAssistant.getSettings());
  }
  useEffect(() => {
    void refreshSettings().catch((reason: unknown) => {
      setNotice({
        kind: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Could not read settings. You can clear the saved key in Settings.",
      });
    });
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (captureOpen || event.altKey || event.shiftKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setPage("desk");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [captureOpen]);
  const shortcutLabel = navigator.userAgent.includes("Mac") ? "⌘1" : "Ctrl+1";

  async function ask() {
    if (!confirmed) {
      setNotice({
        kind: "error",
        text: "Please confirm this is for practice or an assessment where AI help is allowed.",
      });
      return;
    }
    setNotice(null);
    setAnswer("");
    setBusy(true);
    try {
      const reply = await window.studyAssistant.askAssistant({
        question,
        imageDataUrl: image || undefined,
      });
      setAnswer(reply.text);
      setModel(reply.model);
    } catch (reason) {
      setNotice({
        kind: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Could not get a response. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <div className="brand">
          <StudyMark />
          <span>
            study<span className="brand-light">desk</span>
          </span>
          <button
            className="collapse-button"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <button
          className={`nav-item ${page === "desk" ? "nav-active" : ""}`}
          aria-label={`Study desk (${shortcutLabel})`}
          title={`Study desk (${shortcutLabel})`}
          onClick={() => setPage("desk")}
        >
          <BookOpen size={17} />
          <span>Study desk</span>
          <span className="nav-shortcut">{shortcutLabel}</span>
        </button>
        <div className="sidebar-label">YOUR SPACE</div>
        <button
          className="nav-item nav-muted"
          disabled
          title="Saved question history is coming soon"
          aria-label="Recent questions (coming soon)"
        >
          <Clock3 size={17} />
          <span>Recent questions</span>
          <span className="coming-soon">Soon</span>
        </button>
        <div className="sidebar-spacer" />
        <div className="sidebar-coach-card">
          <div className="coach-orb">
            <Sparkles size={15} />
          </div>
          <strong>Learn at your pace</strong>
          <span>Small steps make hard topics easier.</span>
          <div className="coach-decoration">✳</div>
        </div>
        <button
          className={`nav-item settings-nav ${page === "settings" ? "nav-active" : ""}`}
          aria-label="Settings"
          title="Settings"
          onClick={() => {
            setPage("settings");
            setNotice(null);
          }}
        >
          <Settings2 size={17} />
          <span>Settings</span>
          <span
            className={`status-dot ${settings?.hasApiKey ? "status-connected" : ""}`}
          />
        </button>
        <div className="sidebar-profile">
          <div className="avatar">S</div>
          <div>
            <strong>Study session</strong>
            <span>Personal workspace</span>
          </div>
          <ChevronDown size={15} className="profile-chevron" />
        </div>
      </aside>
      {page === "settings" ? (
        <SettingsPage
          settings={settings}
          onBack={() => setPage("desk")}
          onChanged={refreshSettings}
        />
      ) : (
        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>Study desk</strong>
            </div>
            <div className="topbar-right">
              <span className="privacy-chip">
                <span className="green-dot" /> Private session
              </span>
              <button
                className="help-button"
                aria-label="Help"
                onClick={() =>
                  setNotice({
                    kind: "success",
                    text: "Capture a question, check the crop, then ask for a step-by-step explanation.",
                  })
                }
              >
                <CircleHelp size={18} />
              </button>
            </div>
          </header>
          <div className="desk-body">
            <div className="page-heading desk-heading">
              <div className="greeting-line">
                <span className="eyebrow">YOUR LEARNING SPACE</span>
                <span className="date-chip">
                  <Sparkles size={13} /> Focus mode
                </span>
              </div>
              <h1>
                Let’s figure it out<span className="heading-period">.</span>
              </h1>
              <p>Bring a question. We’ll work through the idea together.</p>
            </div>
            <div className="permission-banner">
              <div className="permission-icon">
                <ShieldCheck size={17} />
              </div>
              <div>
                <strong>For practice and permitted learning</strong>
                <span>
                  Only use AI assistance when your assessment rules allow it.
                </span>
              </div>
              <span className="banner-link">
                Free model availability can vary <ArrowUpRight size={14} />
              </span>
            </div>
            <div className="workspace-grid">
              <section className="question-card">
                <div className="card-heading">
                  <div>
                    <span className="step-tag">STEP 01</span>
                    <h2>Bring in a question</h2>
                  </div>
                  <span className="optional-tag">YOUR INPUT</span>
                </div>
                <p className="card-subtitle">
                  Type or paste a question, or attach a cropped screenshot.
                </p>
                <div className="question-field-wrap">
                  <label htmlFor="question-input" className="field-label">
                    Question or topic
                  </label>
                  <textarea
                    id="question-input"
                    maxLength={12_000}
                    placeholder={
                      "Paste a question here…\n\nYou can also tell me what part feels confusing."
                    }
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={7}
                  />
                  <span className="character-count">
                    {question.length.toLocaleString()} / 12,000
                  </span>
                </div>
                <button
                  className={`capture-attach ${image ? "has-image" : ""}`}
                  onClick={() => setCaptureOpen(true)}
                >
                  {image ? (
                    <>
                      <img src={image} alt="Selected question crop" />
                      <span className="attach-text">
                        <strong>Question crop attached</strong>
                        <small>Saved in this session · click to replace</small>
                      </span>
                      <button
                        className="remove-image"
                        aria-label="Remove screenshot"
                        onClick={(event) => {
                          event.stopPropagation();
                          setImage("");
                        }}
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="attach-icon">
                        <ImagePlus size={18} />
                      </span>
                      <span className="attach-text">
                        <strong>Capture a screen or window</strong>
                        <small>We’ll help you crop to just the question</small>
                      </span>
                      <Plus size={17} className="attach-plus" />
                    </>
                  )}
                </button>
                <div className="card-divider" />
                <label className="confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span className="custom-check">
                    <Check size={12} />
                  </span>
                  <span>
                    I’m practicing or AI help is allowed for this assessment.
                  </span>
                </label>
                <button
                  className="button button-primary ask-button"
                  disabled={busy || (!question.trim() && !image)}
                  onClick={() => void ask()}
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Thinking…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Help me understand{" "}
                      <Send size={14} className="send-icon" />
                    </>
                  )}
                </button>
                {!settings?.hasApiKey && (
                  <div className="key-reminder">
                    <KeyRound size={14} />
                    <span>Add an OpenRouter key in</span>
                    <button
                      onClick={() => {
                        setPage("settings");
                        setNotice(null);
                      }}
                    >
                      Settings <ArrowUpRight size={12} />
                    </button>
                  </div>
                )}
              </section>
              <section
                className={`coach-card ${answer || busy || notice ? "coach-card-response" : ""}`}
              >
                <div className="coach-card-top">
                  <div className="coach-identity">
                    <div className="coach-avatar">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <strong>Your study coach</strong>
                      <span>
                        <i className="online-dot" /> Ready when you are
                      </span>
                    </div>
                  </div>
                </div>
                {!answer && !busy && !notice && (
                  <div className="coach-empty">
                    <div className="empty-illustration">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="empty-book">
                        <BookOpen size={29} />
                      </div>
                      <span className="float-star star-a">✦</span>
                      <span className="float-star star-b">✧</span>
                      <span className="float-dot" />
                    </div>
                    <span className="eyebrow">
                      A LITTLE CLARITY GOES A LONG WAY
                    </span>
                    <h3>Questions are a good place to start.</h3>
                    <p>
                      Add a question and I’ll break the reasoning into clear,
                      manageable steps.
                    </p>
                    <div className="suggestion-chip">
                      <MessageCircle size={14} /> “Can you explain it simply?”
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="thinking-state">
                    <div className="thinking-icon">
                      <Sparkles size={21} />
                    </div>
                    <strong>Working through it</strong>
                    <span>Finding a clear way to explain the idea…</span>
                    <div className="thinking-bars">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}
                {notice && (
                  <div
                    className={
                      notice.kind === "error"
                        ? "response-error"
                        : "response-notice"
                    }
                  >
                    <CircleHelp size={18} />
                    <span>{notice.text}</span>
                    <button
                      onClick={() => setNotice(null)}
                      aria-label="Dismiss"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                {answer && (
                  <div className="answer-content">
                    <div className="answer-label">
                      <span>
                        <Sparkles size={14} /> EXPLANATION
                      </span>
                      <button
                        aria-label="Clear response"
                        onClick={() => {
                          setAnswer("");
                          setNotice(null);
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="answer-text">
                      {answer
                        .split("\n")
                        .map((line, index) =>
                          line ? (
                            <p key={index}>{line}</p>
                          ) : (
                            <div key={index} className="answer-space" />
                          ),
                        )}
                    </div>
                    <div className="answer-footer">
                      <span className="model-label">
                        <span className="model-dot" /> {model}
                      </span>
                      <span>Check important details</span>
                    </div>
                  </div>
                )}
                <div className="coach-card-footer">
                  <ShieldCheck size={14} />
                  <span>
                    Your screenshot is cropped locally before it’s sent.
                  </span>
                </div>
              </section>
            </div>
            <div className="bottom-note">
              <span>MADE FOR LEARNING</span>
              <span className="note-dot">·</span>
              <span>Use only where AI assistance is permitted</span>
              <span className="note-right">
                Free models may have usage limits <ArrowDown size={13} />
              </span>
            </div>
          </div>
        </main>
      )}
      {captureOpen && (
        <CaptureDialog
          onClose={() => setCaptureOpen(false)}
          onUse={(cropped) => {
            setImage(cropped);
            setCaptureOpen(false);
            setNotice(null);
          }}
        />
      )}
    </div>
  );
}
