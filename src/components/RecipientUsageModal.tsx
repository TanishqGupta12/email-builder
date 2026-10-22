"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type UsageEvent = {
  campaignId: string;
  subject: string;
  bodyHtml: string;
  senderEmail: string;
  campaignStatus: string;
  recipientStatus: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  attachmentCount: number;
};

type Timeline = {
  email: string;
  usedBefore: boolean;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  events: UsageEvent[];
};

type Props = {
  email: string;
  onClose: () => void;
  onViewOther?: (email: string) => void;
  relatedEmails?: string[];
};

function statusClass(status: string) {
  const s = status.toUpperCase();
  if (s === "SENT" || s === "COMPLETED") return "text-[var(--color-ok)]";
  if (s === "FAILED") return "text-[var(--color-danger)]";
  return "text-[var(--color-warn)]";
}

export function RecipientUsageModal({
  email,
  onClose,
  onViewOther,
  relatedEmails = [],
}: Props) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTimeline(null);
    setError(null);
    setExpandedId(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/recipients/usage?email=${encodeURIComponent(email)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Could not load history");
          return;
        }
        if (!cancelled) {
          const t = data.timeline as Timeline;
          setTimeline(t);
          if (t.events[0]) setExpandedId(t.events[0].campaignId);
        }
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  const others = relatedEmails.filter(
    (e) => e.toLowerCase() !== email.toLowerCase(),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-timeline-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(21,32,43,0.5)] backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_64px_rgba(21,32,43,0.22)] sm:rounded-2xl"
        style={{ maxHeight: "min(90dvh, 760px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-line)] px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              Previous usage
            </p>
            <h3
              id="usage-timeline-title"
              className="mt-1 break-all font-display text-lg font-semibold text-[var(--color-ink)]"
            >
              {email}
            </h3>
            {timeline && (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                {timeline.events.length} past send
                {timeline.events.length === 1 ? "" : "s"}
                {" · "}
                <span className="text-[var(--color-ok)]">{timeline.sentCount} sent</span>
                {" · "}
                <span className="text-[var(--color-warn)]">{timeline.pendingCount} pending</span>
                {" · "}
                <span className="text-[var(--color-danger)]">{timeline.failedCount} failed</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[#f0f4f8]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {others.length > 0 && onViewOther && (
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-line)] px-4 py-2.5 sm:px-5">
            <span className="w-full text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Also used before
            </span>
            {others.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-full border border-[var(--color-line)] bg-[#f8fafc] px-2.5 py-1 font-mono text-[0.7rem] text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                onClick={() => onViewOther(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {error && <div className="ui-alert ui-alert-error">{error}</div>}
          {!timeline && !error && (
            <div className="space-y-3">
              <div className="h-4 w-1/2 animate-pulse rounded bg-[#eef2f6]" />
              <div className="h-24 animate-pulse rounded-xl bg-[#eef2f6]" />
            </div>
          )}
          {timeline && !timeline.usedBefore && (
            <div className="rounded-xl border border-[var(--color-line)] bg-[#f8fafc] px-4 py-8 text-center">
              <p className="font-display font-semibold text-[var(--color-ink)]">
                No previous sends
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                This address has not been used in your campaign history yet.
              </p>
            </div>
          )}
          {timeline && timeline.usedBefore && (
            <ol className="relative space-y-0 border-l-2 border-[var(--color-line)] pl-5">
              {timeline.events.map((event, index) => {
                const when = event.sentAt || event.createdAt;
                const open = expandedId === event.campaignId;
                return (
                  <li key={`${event.campaignId}-${index}`} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--color-accent)] shadow" />
                    <button
                      type="button"
                      className="w-full rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-3 text-left transition hover:border-[var(--color-accent)] hover:bg-[#f8fafc]"
                      onClick={() =>
                        setExpandedId(open ? null : event.campaignId)
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[var(--color-ink)]">
                            {event.subject || "(no subject)"}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                            {new Date(when).toLocaleString()}
                            {" · from "}
                            <span className="font-mono">{event.senderEmail}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs">
                          <span className={statusClass(event.recipientStatus)}>
                            {event.recipientStatus}
                          </span>
                          <span className="text-[var(--color-ink-muted)]">
                            {event.attachmentCount > 0
                              ? `${event.attachmentCount} file${event.attachmentCount === 1 ? "" : "s"}`
                              : "No files"}
                          </span>
                        </div>
                      </div>
                      {event.errorMessage ? (
                        <p className="mt-2 text-xs text-[var(--color-danger)]">
                          {event.errorMessage}
                        </p>
                      ) : null}
                      {open && (
                        <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                            Message sent
                          </p>
                          <div
                            className="campaign-html-preview max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[#fbfcfd] px-3 py-3 text-sm leading-relaxed text-[var(--color-ink)]"
                            dangerouslySetInnerHTML={{ __html: event.bodyHtml }}
                          />
                        </div>
                      )}
                      <p className="mt-2 text-[0.7rem] font-semibold text-[var(--color-accent)]">
                        {open ? "Hide content" : "View content"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-[var(--color-line)] px-4 py-3 sm:px-5">
          <button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
