import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crop,
  Eye,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScanLine,
  ScanText,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { AppSettings, QuestionHistoryEntry } from "../../shared/types";
import {
  AnswerMarkdown,
  HistoryPage,
  OcrDialog,
  CaptureDialog,
} from "./LazyFeatures";
import { useAssistantResponse } from "./useAssistantResponse";

type Notice = { kind: "error" | "success"; text: string };

function StudyMark() {
  return (
    <span className="brand-mark">
      <Sparkles size={17} strokeWidth={2.2} />
    </span>
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
  const [desktop, setDesktop] = useState<{
    shortcutRegistered: boolean;
  } | null>(null);
  useEffect(() => {
    void window.studyAssistant
      .getDesktopState()
      .then(setDesktop)
      .catch(() => {});
  }, []);
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
      <section className="settings-card desktop-settings">
        <h2>Quick overlay</h2>
        <p>
          Press <kbd>Ctrl+Shift+Space</kbd> to show or hide the overlay from any
          application.
        </p>
        <p>
          {desktop?.shortcutRegistered
            ? "Global shortcut is active."
            : "If the shortcut is unavailable, use the button below or the tray menu."}
        </p>
        <button
          className="button button-quiet"
          onClick={() => void window.studyAssistant.showOverlay()}
        >
          Open quick overlay
        </button>
        <p>
          Closing the study desk keeps it in the system tray. Choose Quit Study
          Desk in the tray menu to exit.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [page, setPage] = useState<"desk" | "settings" | "history">("desk");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureForOcr, setCaptureForOcr] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [image, setImage] = useState("");
  const [question, setQuestion] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const {
    answer,
    setAnswer,
    model,
    setModel,
    busy,
    notice,
    setNotice,
    savedId,
    setSavedId,
    stopping,
    incomplete,
    setIncomplete,
    stopResponse,
    submit,
  } = useAssistantResponse();

  function newQuestion() {
    setIncomplete(false);
    setQuestion("");
    setImage("");
    setAnswer("");
    setModel("");
    setNotice(null);
    setSavedId(null);
    setConfirmed(false);
    setPreviewOpen(false);
    setPage("desk");
  }

  function openQuestion(entry: QuestionHistoryEntry) {
    setIncomplete(false);
    setQuestion(entry.question);
    setImage(entry.imageDataUrl || "");
    setAnswer(entry.answer);
    setModel(entry.model);
    setSavedId(entry.id);
    setNotice(null);
    setConfirmed(false);
    setPreviewOpen(false);
    setPage("desk");
  }

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
      if (captureOpen || ocrImage || event.altKey || event.shiftKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "1") {
        event.preventDefault();
        setPage("desk");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [captureOpen, ocrImage]);
  const shortcutLabel = navigator.userAgent.includes("Mac") ? "⌘1" : "Ctrl+1";

  async function ask() {
    if (busy) return;
    if (!confirmed) {
      setNotice({
        kind: "error",
        text: "Please confirm this is for practice or an assessment where AI help is allowed.",
      });
      return;
    }
    await submit({ question, imageDataUrl: image || undefined });
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
          className={`nav-item history-nav ${page === "history" ? "nav-active" : ""}`}
          disabled={busy}
          title="Recent questions"
          aria-label="Recent questions"
          onClick={() => {
            setSavedId(null);
            setPage("history");
          }}
        >
          <Clock3 size={17} />
          <span>Recent questions</span>
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
      ) : page === "history" ? (
        <HistoryPage onOpen={openQuestion} onNew={newQuestion} />
      ) : (
        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>Study desk</strong>
            </div>
            <div className="topbar-right">
              <button
                className="button button-quiet overlay-launch"
                aria-label="Open quick overlay"
                title="Ctrl+Shift+Space"
                onClick={() =>
                  void window.studyAssistant.showOverlay().catch(() =>
                    setNotice({
                      kind: "error",
                      text: "Could not open the overlay. Please try again.",
                    }),
                  )
                }
              >
                Quick overlay
              </button>
              <span className="privacy-chip">
                <span className="green-dot" /> Saved on this device
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
              {(answer || question || image) && (
                <button
                  className="new-question-link"
                  disabled={busy}
                  onClick={newQuestion}
                >
                  <Plus size={14} /> New question
                </button>
              )}
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
                    disabled={busy}
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
                <div className="capture-attach-wrap">
                  <button
                    className={`capture-attach ${image ? "has-image" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setCaptureForOcr(false);
                      setCaptureOpen(true);
                    }}
                  >
                    {image ? (
                      <>
                        <img src={image} alt="Selected question crop" />
                        <span className="attach-text">
                          <strong>Question crop attached</strong>
                          <small>
                            {savedId
                              ? "Saved with this question"
                              : "Attached to this question"}{" "}
                            · click to replace
                          </small>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="attach-icon">
                          <ImagePlus size={18} />
                        </span>
                        <span className="attach-text">
                          <strong>Capture a screen or window</strong>
                          <small>
                            We’ll help you crop to just the question
                          </small>
                        </span>
                        <Plus size={17} className="attach-plus" />
                      </>
                    )}
                  </button>
                  {image && (
                    <>
                      <button
                        className="remove-image view-image"
                        aria-label="View screenshot"
                        onClick={() => setPreviewOpen(true)}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        className="remove-image"
                        aria-label="Remove screenshot"
                        disabled={busy}
                        onClick={() => setImage("")}
                      >
                        <X size={15} />
                      </button>
                    </>
                  )}
                </div>
                <div className="ocr-entry-actions">
                  <button
                    className="ocr-entry"
                    disabled={busy}
                    onClick={() => {
                      setCaptureForOcr(true);
                      setCaptureOpen(true);
                    }}
                  >
                    <ScanText size={16} />
                    <span>
                      <strong>Extract text from screen</strong>
                      <small>
                        Read locally, review, then use as your question
                      </small>
                    </span>
                  </button>
                  {image && (
                    <button
                      className="ocr-attached"
                      disabled={busy}
                      onClick={() => setOcrImage(image)}
                    >
                      Extract attached crop
                    </button>
                  )}
                </div>
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
                      <LoaderCircle size={16} className="spin" />{" "}
                      {answer ? "Writing…" : "Thinking…"}
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
                        <i className="online-dot" />{" "}
                        {busy
                          ? "Writing your explanation"
                          : "Ready when you are"}
                      </span>
                    </div>
                  </div>
                  {busy && (
                    <button
                      className="stop-response"
                      disabled={stopping}
                      onClick={() => void stopResponse()}
                      aria-label="Stop response"
                    >
                      <Square size={12} /> {stopping ? "Stopping…" : "Stop"}
                    </button>
                  )}
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
                {busy && !answer && (
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
                  <div className="answer-content" aria-busy={busy}>
                    <div className="answer-label">
                      <span>
                        <Sparkles size={14} />{" "}
                        {busy
                          ? "WRITING EXPLANATION"
                          : incomplete
                            ? "PARTIAL EXPLANATION"
                            : "EXPLANATION"}
                      </span>
                      <button
                        aria-label="Clear response"
                        disabled={busy}
                        onClick={() => {
                          setAnswer("");
                          setNotice(null);
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <AnswerMarkdown text={answer} />
                    <div className="answer-footer">
                      <span className="model-label">
                        <span className="model-dot" /> {model}
                      </span>
                      <span>
                        {busy
                          ? "Receiving response…"
                          : incomplete
                            ? "Partial response · not saved"
                            : savedId
                              ? "Saved in recent questions"
                              : "Check important details"}
                      </span>
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
      {previewOpen && image && (
        <div
          className="modal-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(false);
          }}
        >
          <section
            className="image-preview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="dialog-top">
              <h2 id="preview-title">Question crop</h2>
              <button
                className="icon-button"
                aria-label="Close screenshot preview"
                onClick={() => setPreviewOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <img src={image} alt="Attached question crop" />
          </section>
        </div>
      )}
      {captureOpen && (
        <CaptureDialog
          forOcr={captureForOcr}
          onClose={() => setCaptureOpen(false)}
          onUse={(cropped) => {
            if (captureForOcr) setOcrImage(cropped);
            else setImage(cropped);
            setCaptureOpen(false);
            setNotice(null);
          }}
        />
      )}
      {ocrImage && (
        <OcrDialog
          image={ocrImage}
          question={question}
          onClose={() => setOcrImage(null)}
          onRecapture={() => {
            setOcrImage(null);
            setCaptureForOcr(true);
            setCaptureOpen(true);
          }}
          onUse={(text, keepCrop) => {
            setQuestion(text);
            setImage(keepCrop ? ocrImage : "");
            setOcrImage(null);
            setAnswer("");
            setModel("");
            setSavedId(null);
            setIncomplete(false);
            setNotice(null);
          }}
        />
      )}
    </div>
  );
}
