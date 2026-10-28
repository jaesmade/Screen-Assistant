import { useEffect, useRef, useState } from "react";
import type { AssistantRequest } from "../../shared/types";
type Notice = { kind: "error" | "success"; text: string };
export function useAssistantResponse() {
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const activeRequestId = useRef<string | null>(null);
  const partialText = useRef("");

  useEffect(() => {
    const unsubscribe = window.studyAssistant.onAssistantUpdate((update) => {
      if (activeRequestId.current !== update.requestId) return;
      partialText.current = update.text;
      setAnswer(update.text);
      setModel(update.model);
    });
    return () => {
      unsubscribe();
      const id = activeRequestId.current;
      activeRequestId.current = null;
      if (id) void window.studyAssistant.cancelAssistant(id).catch(() => {});
    };
  }, []);

  async function submit(request: AssistantRequest) {
    if (busy || activeRequestId.current) return;
    setNotice(null);
    setAnswer("");
    setSavedId(null);
    setModel("");
    setIncomplete(false);
    setStopping(false);
    partialText.current = "";
    const id = crypto.randomUUID();
    activeRequestId.current = id;
    setBusy(true);
    try {
      const reply = await window.studyAssistant.askAssistant(request, id);
      if (activeRequestId.current !== id) return;
      setAnswer(reply.text);
      setModel(reply.model);
      setSavedId(reply.historyId || null);
      setIncomplete(Boolean(reply.cancelled));
      if (reply.cancelled)
        setNotice({
          kind: "success",
          text: reply.text.trim()
            ? "Response stopped. This partial explanation was not saved."
            : "Response stopped before any explanation arrived.",
        });
      if (reply.historyWarning)
        setNotice({ kind: "error", text: reply.historyWarning });
    } catch (reason) {
      if (activeRequestId.current !== id) return;
      setIncomplete(true);
      const message =
        reason instanceof Error
          ? reason.message
          : "Could not get a response. Please try again.";
      setNotice({
        kind: "error",
        text:
          partialText.current && !message.includes("not saved")
            ? `${message} The partial explanation was not saved.`
            : message,
      });
    } finally {
      if (activeRequestId.current === id) {
        activeRequestId.current = null;
        setBusy(false);
        setStopping(false);
      }
    }
  }

  async function stopResponse() {
    const id = activeRequestId.current;
    if (!id || stopping) return;
    setStopping(true);
    try {
      const cancelled = await window.studyAssistant.cancelAssistant(id);
      if (!cancelled && activeRequestId.current === id) setStopping(false);
    } catch {
      if (activeRequestId.current === id) {
        setStopping(false);
        setNotice({
          kind: "error",
          text: "Could not stop the response. Please try the stop button again.",
        });
      }
    }
  }

  return {
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
  };
}
