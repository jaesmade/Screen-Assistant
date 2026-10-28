import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  ImagePlus,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type {
  QuestionHistoryEntry,
  QuestionHistorySummary,
} from "../../shared/types";

export function HistoryPage({
  onOpen,
  onNew,
}: {
  onOpen: (entry: QuestionHistoryEntry) => void;
  onNew: () => void;
}) {
  const [entries, setEntries] = useState<QuestionHistorySummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void window.studyAssistant
      .getHistory()
      .then((items) => {
        if (mounted.current) setEntries(items);
      })
      .catch((reason) => {
        if (mounted.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load saved questions.",
          );
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function action(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not update saved questions.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const query = search.trim().toLocaleLowerCase();
  const visible = entries.filter((entry) =>
    `${entry.question} ${entry.preview} ${entry.model} ${entry.hasImage ? "screenshot" : ""}`
      .toLocaleLowerCase()
      .includes(query),
  );

  return (
    <main className="main-content history-content">
      <div className="history-heading">
        <div className="page-heading">
          <span className="eyebrow">YOUR LEARNING LIBRARY</span>
          <h1>Recent questions</h1>
          <p>
            Pick up where you left off. Questions and crops stay saved on this
            device.
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={onNew}
          disabled={busy}
        >
          <Plus size={15} /> New question
        </button>
      </div>
      <div className="history-toolbar">
        <label className="history-search">
          <Search size={16} />
          <input
            aria-label="Search saved questions"
            placeholder="Search questions, explanations, or models…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="history-count">{entries.length} saved</span>
        <button
          className="button button-quiet"
          onClick={() => setConfirmClear(true)}
          disabled={busy || loading || (!entries.length && !error)}
        >
          <Trash2 size={14} /> Clear history
        </button>
      </div>
      {confirmClear && (
        <div className="history-confirm" role="alert">
          <div>
            <strong>Clear all saved questions?</strong>
            <p>
              This removes saved questions, explanations, and crops from this
              device.
            </p>
          </div>
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await window.studyAssistant.clearHistory();
                setEntries([]);
                setConfirmClear(false);
              })
            }
          >
            Clear all
          </button>
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="history-empty" role="status">
          <LoaderCircle className="spin" size={24} /> Loading your questions…
        </div>
      ) : visible.length ? (
        <div
          className="history-list"
          aria-label="Saved questions"
          aria-busy={busy}
        >
          {visible.map((entry) => (
            <article className="history-item" key={entry.id}>
              <button
                className="history-open"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const saved = await window.studyAssistant.getHistoryEntry(
                      entry.id,
                    );
                    if (!mounted.current) return;
                    if (!saved) {
                      setEntries((items) =>
                        items.filter((item) => item.id !== entry.id),
                      );
                      throw new Error(
                        "This saved question is no longer available.",
                      );
                    }
                    onOpen(saved);
                  })
                }
              >
                <span className="history-item-icon">
                  {entry.hasImage ? (
                    <ImagePlus size={19} />
                  ) : (
                    <Clock3 size={19} />
                  )}
                </span>
                <span className="history-item-body">
                  <strong>
                    {entry.question.trim() || "Screenshot question"}
                  </strong>
                  <span className="history-preview">{entry.preview}</span>
                  <span className="history-meta">
                    <time dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    <span>·</span>
                    {entry.model}
                    {entry.hasImage && <span>· With crop</span>}
                  </span>
                </span>
                <ArrowUpRight size={16} />
              </button>
              <button
                className="icon-button history-delete"
                disabled={busy}
                aria-label={`Delete saved question: ${entry.question.trim().slice(0, 60) || "Screenshot question"}`}
                onClick={() =>
                  void action(async () => {
                    await window.studyAssistant.deleteHistoryEntry(entry.id);
                    setEntries((items) =>
                      items.filter((item) => item.id !== entry.id),
                    );
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="history-empty">
          <Clock3 size={30} />
          <h2>
            {query
              ? "No matching questions"
              : "Your next question starts a collection"}
          </h2>
          <p>
            {query
              ? "Try another search."
              : "Successful explanations are saved here automatically, along with any question crop."}
          </p>
          {!query && (
            <button className="button button-primary" onClick={onNew}>
              <Plus size={15} /> Ask a question
            </button>
          )}
        </div>
      )}
      <p className="history-footnote">
        History is stored on this device without encryption; your API key stays
        encrypted. Keeps the latest 100 questions within 50 MB; older questions
        are removed as needed.
      </p>
    </main>
  );
}
