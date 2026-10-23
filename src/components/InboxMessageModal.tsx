"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type InboxReusePayload = {
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  recipientsText?: string;
};

type InboxFull = {
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  date: string | null;
  seen: boolean;
  html: string;
  text: string;
  attachments: { filename: string; contentType: string; size: number }[];
};

type Props = {
  uid: number;
  onClose: () => void;
  onChanged?: () => void;
  onUseAsNew: (payload: InboxReusePayload) => void;
};

export function InboxMessageModal({ uid, onClose, onChanged, onUseAsNew }: Props) {
  const [message, setMessage] = useState<InboxFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/inbox/${uid}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Could not load message");
          return;
        }
        if (!cancelled) {
          setMessage(data.message as InboxFull);
          onChangedRef.current?.();
        }
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function markSeen(seen: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids: [uid], seen }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not update message");
        return;
      }
      setMessage((m) => (m ? { ...m, seen } : m));
      onChanged?.();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this email from your inbox permanently?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox/${uid}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not delete message");
        return;
      }
      onChanged?.();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  function useAsNew() {
    if (!message) return;
    const quoted =
      message.html ||
      `<pre style="white-space:pre-wrap;font-family:inherit">${message.text}</pre>`;
    onUseAsNew({
      senderEmail: "",
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      bodyHtml: `<p></p><hr/><p><em>Original message from ${message.fromEmail || "sender"}:</em></p>${quoted}`,
      recipientsText: message.fromEmail,
    });
    onClose();
  }

  if (!mounted) return null;

  const fromLabel =
    message?.fromName && message.fromEmail
      ? `${message.fromName} <${message.fromEmail}>`
      : message?.fromEmail || message?.fromName || "Unknown";

  return createPortal(
    <div
      data-overlay=""
      className="flex items-center justify-center p-4 sm:p-6"
      style={{ position: "fixed", inset: 0, zIndex: 500 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inbox-message-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(21,32,43,0.5)] backdrop-blur-[2px]"
        aria-label="Close dialog backdrop"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_64px_rgba(21,32,43,0.22)] sm:rounded-2xl"
        style={{ maxHeight: "min(90dvh, 800px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-line)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3
              id="inbox-message-title"
              className="font-display text-base font-semibold leading-snug text-[var(--color-ink)] sm:text-lg"
            >
              {message?.subject ?? "Message"}
            </h3>
            {message && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                {message.date ? new Date(message.date).toLocaleString() : "Unknown date"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] bg-white text-base text-[var(--color-ink-muted)] transition hover:bg-[#f0f4f8] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {error && <div className="ui-alert ui-alert-error mb-3">{error}</div>}
          {!message && !error && (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef2f6]" />
              <div className="h-48 animate-pulse rounded-xl bg-[#eef2f6]" />
            </div>
          )}
          {message && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-[var(--color-line)] bg-[#f8fafc] px-4 py-3 text-sm">
                <MetaRow label="From" value={fromLabel} />
                <MetaRow label="To" value={message.to || "—"} />
                <MetaRow
                  label="Date"
                  value={message.date ? new Date(message.date).toLocaleString() : "—"}
                />
              </div>

              {message.attachments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                    Attachments
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {message.attachments.map((a, i) => (
                      <li
                        key={`${a.filename}-${i}`}
                        className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs"
                      >
                        <span className="font-mono">{a.filename}</span>
                        <span className="ml-2 text-[var(--color-ink-muted)]">
                          {Math.max(1, Math.round(a.size / 1024))} KB
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Message
                </p>
                <div
                  className="campaign-html-preview rounded-xl border border-[var(--color-line)] bg-white px-4 py-4 text-sm leading-relaxed text-[var(--color-ink)]"
                  dangerouslySetInnerHTML={{ __html: message.html }}
                />
              </div>
            </div>
          )}
        </div>

        {message && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-line)] bg-white px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void markSeen(!message.seen)}
                className="ui-btn ui-btn-ghost"
              >
                Mark {message.seen ? "unread" : "read"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="ui-btn ui-btn-danger"
              >
                Delete
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost">
                Close
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={useAsNew}
                className="ui-btn ui-btn-primary"
              >
                Use Mail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="w-12 shrink-0 font-semibold text-[var(--color-ink-muted)]">{label}</span>
      <span className="min-w-0 break-all font-mono text-[var(--color-ink)]">{value}</span>
    </div>
  );
}
