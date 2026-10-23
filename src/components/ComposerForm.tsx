"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createPortal } from "react-dom";
import {
  extractEmailsFromPaste,
  parseEmailPaste,
  partitionEmails,
} from "@/lib/recipients";
import type { CampaignReusePayload } from "@/components/CampaignDetailModal";
import { RecipientUsageModal } from "@/components/RecipientUsageModal";
import { COMPOSER_REUSE_KEY } from "@/lib/composer-reuse";

type PriorUseHit = {
  email: string;
  usedBefore: boolean;
  sentCount: number;
  failedCount: number;
  lastActivityAt: string | null;
  lastSubject: string | null;
};

const RichTextEditor = dynamic(
  () => import("@/components/RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-[240px] animate-pulse rounded-[0.85rem] bg-[#eef2f6]" />,
  },
);

type CampaignDetail = {
  id: string;
  status: string;
  recipients: { email: string; status: string; errorMessage: string | null }[];
};

export function ComposerForm() {
  const [defaultSender, setDefaultSender] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [recipientsText, setRecipientsText] = useState("");
  const [sendMode, setSendMode] = useState<"instant" | "delayed">("instant");
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [files, setFiles] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidList, setInvalidList] = useState<string[]>([]);
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);
  const [liveCampaign, setLiveCampaign] = useState<CampaignDetail | null>(null);
  const recipientsRef = useRef<HTMLTextAreaElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const [richTextBootKey, setRichTextBootKey] = useState(0);
  const pendingRichTextRemount = useRef(false);
  const [reuseNotice, setReuseNotice] = useState<string | null>(null);
  const [priorHits, setPriorHits] = useState<PriorUseHit[]>([]);
  const [usageEmail, setUsageEmail] = useState<string | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const alertedEmailsRef = useRef<Set<string>>(new Set());

  const clearCsv = useCallback(() => {
    setCsvFile(null);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && attachmentsInputRef.current) {
        attachmentsInputRef.current.value = "";
      }
      return next;
    });
  }, []);

  const clearAllAttachments = useCallback(() => {
    setFiles([]);
    if (attachmentsInputRef.current) attachmentsInputRef.current.value = "";
  }, []);

  const validRecipients = useMemo(() => {
    const { valid } = partitionEmails(parseEmailPaste(recipientsText));
    return valid;
  }, [recipientsText]);

  const pasteRecipientCount = validRecipients.length;

  const priorUsed = useMemo(
    () => priorHits.filter((h) => h.usedBefore),
    [priorHits],
  );

  useEffect(() => {
    if (validRecipients.length === 0) {
      setPriorHits([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCheckingUsage(true);
        try {
          const res = await fetch("/api/recipients/usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emails: validRecipients }),
          });
          const data = await res.json();
          if (!res.ok || cancelled) return;
          const results = (data.results as PriorUseHit[]) ?? [];
          setPriorHits(results);

          const newlyUsed = results.filter(
            (r) =>
              r.usedBefore &&
              !alertedEmailsRef.current.has(r.email.trim().toLowerCase()),
          );
          if (newlyUsed.length > 0) {
            for (const hit of newlyUsed) {
              alertedEmailsRef.current.add(hit.email.trim().toLowerCase());
            }
            setUsageEmail(newlyUsed[0].email);
          }
        } catch {
          if (!cancelled) setPriorHits([]);
        } finally {
          if (!cancelled) setCheckingUsage(false);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [validRecipients]);

  const handleRecipientsPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData("text/plain");
      const tokens = extractEmailsFromPaste(pasted);
      if (tokens.length === 0) return;
      e.preventDefault();

      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;

      let cursor = 0;
      flushSync(() => {
        setRecipientsText((prev) => {
          const before = prev.slice(0, start);
          const after = prev.slice(end);
          const insertion = tokens.join("\n");
          const sep =
            before.length > 0 && !before.endsWith("\n") && !before.endsWith("\r") ? "\n" : "";
          const next = before + sep + insertion + after;
          cursor = before.length + sep.length + insertion.length;
          return next;
        });
      });
      recipientsRef.current?.setSelectionRange(cursor, cursor);
    },
    [],
  );

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(
        (d: {
          defaultSender?: string;
          defaultSubject?: string;
          defaultMessageHtml?: string;
        }) => {
          const s = d.defaultSender ?? "";
          setDefaultSender(s);
          setSenderEmail((prev) => prev || s);

          const sub = d.defaultSubject?.trim() ?? "";
          if (sub) setSubject((prev) => prev || sub);

          const msg = d.defaultMessageHtml?.trim() ?? "";
          if (msg) {
            setBodyHtml((prev) => {
              const empty =
                prev === "<p></p>" ||
                prev === "<p><br></p>" ||
                !prev.replace(/<[^>]*>/g, "").trim();
              if (empty) {
                pendingRichTextRemount.current = true;
                return msg;
              }
              return prev;
            });
          }
        },
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!pendingRichTextRemount.current) return;
    pendingRichTextRemount.current = false;
    setRichTextBootKey((k) => k + 1);
  }, [bodyHtml]);

  const applyReuse = useCallback(
    async (detail: CampaignReusePayload) => {
      setError(null);
      setReuseNotice(null);
      if (detail.senderEmail?.trim()) {
        setSenderEmail(detail.senderEmail);
      }
      setSubject(detail.subject);
      setBodyHtml(detail.bodyHtml || "<p></p>");
      if (typeof detail.recipientsText === "string") {
        setRecipientsText(detail.recipientsText);
      }
      pendingRichTextRemount.current = true;
      setRichTextBootKey((k) => k + 1);
      clearCsv();
      clearAllAttachments();

      const hasRecipients = Boolean(detail.recipientsText?.trim());

      if (detail.attachments.length === 0) {
        setReuseNotice(
          hasRecipients
            ? "Loaded previous email into Compose. Edit anything, then send."
            : "Loaded previous subject and message. Add recipients, then send.",
        );
        return;
      }

      const loaded: File[] = [];
      let missing = 0;
      for (const att of detail.attachments) {
        try {
          const res = await fetch(
            `/api/campaigns/${detail.campaignId}/attachments/${att.id}`,
          );
          if (!res.ok) {
            missing += 1;
            continue;
          }
          const blob = await res.blob();
          loaded.push(
            new File([blob], att.originalName, {
              type: att.mimeType || blob.type || "application/octet-stream",
            }),
          );
        } catch {
          missing += 1;
        }
      }

      setFiles(loaded);
      if (missing > 0 && loaded.length === 0) {
        setReuseNotice(
          "Loaded subject and message. Attachments were missing — re-attach them if needed.",
        );
      } else if (missing > 0) {
        setReuseNotice(
          `Loaded subject, message, and ${loaded.length} attachment(s). ${missing} file(s) were missing.`,
        );
      } else {
        setReuseNotice(
          hasRecipients
            ? `Loaded previous email with ${loaded.length} attachment(s). Edit and send when ready.`
            : `Loaded previous subject, message, and ${loaded.length} attachment(s). Add recipients, then send.`,
        );
      }
    },
    [clearAllAttachments, clearCsv],
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(COMPOSER_REUSE_KEY);
      if (raw) {
        sessionStorage.removeItem(COMPOSER_REUSE_KEY);
        const detail = JSON.parse(raw) as CampaignReusePayload;
        void applyReuse(detail);
      }
    } catch {
      /* ignore */
    }

    const onReuse = (event: Event) => {
      const detail = (event as CustomEvent<CampaignReusePayload>).detail;
      if (!detail) return;
      void applyReuse(detail);
    };

    window.addEventListener("composer:reuse", onReuse);
    return () => window.removeEventListener("composer:reuse", onReuse);
  }, [applyReuse]);

  const pollCampaign = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.campaign as CampaignDetail;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!lastCampaignId) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      const c = await pollCampaign(lastCampaignId);
      if (stopped || !c) return;
      setLiveCampaign(c);
      window.dispatchEvent(new Event("campaigns:refresh"));
      if (c.status === "COMPLETED") {
        stopped = true;
        window.clearInterval(timer);
      }
    };
    void tick();
    timer = window.setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [lastCampaignId, pollCampaign]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setReuseNotice(null);
    setInvalidList([]);
    setSubmitting(true);
    setLiveCampaign(null);

    try {
      const fd = new FormData();
      fd.set("senderEmail", senderEmail);
      fd.set("subject", subject);
      fd.set("bodyHtml", bodyHtml);
      fd.set("recipientsText", recipientsText);
      fd.set("sendMode", sendMode);
      fd.set("delaySeconds", String(delaySeconds));
      if (csvFile) fd.set("csvFile", csvFile);
      for (const f of files) {
        fd.append("attachments", f);
      }

      const res = await fetch("/api/campaigns", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Request failed");
        if (Array.isArray(data.invalid)) setInvalidList(data.invalid);
        return;
      }

      setLastCampaignId(data.id);
      const count = Number(data.recipientCount) || 0;
      setLiveCampaign({
        id: data.id,
        status: "QUEUED",
        recipients: Array.from({ length: count }, (_, i) => ({
          email: `pending-${i}`,
          status: "PENDING",
          errorMessage: null,
        })),
      });
      window.dispatchEvent(new Event("campaigns:refresh"));
      if (Array.isArray(data.invalid) && data.invalid.length) {
        setInvalidList(data.invalid);
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="min-w-0 space-y-6 pb-28">
        {reuseNotice && <div className="ui-alert ui-alert-ok">{reuseNotice}</div>}

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="ui-label">From</span>
            <input
              type="email"
              required
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder={defaultSender || "you@gmail.com"}
              className="app-input"
            />
          </label>
          <label className="block min-w-0">
            <span className="ui-label">Subject</span>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="app-input"
              placeholder="What is this about?"
            />
          </label>
        </div>

        <div>
          <span className="ui-label">Message</span>
          <RichTextEditor bootKey={richTextBootKey} value={bodyHtml} onChange={setBodyHtml} />
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="ui-label !mb-0">Recipients</span>
            <button
              type="button"
              className="text-xs font-semibold text-[var(--color-accent)] hover:underline disabled:opacity-40"
              disabled={validRecipients.length === 0 || checkingUsage}
              onClick={() => {
                if (priorUsed[0]) setUsageEmail(priorUsed[0].email);
                else if (validRecipients[0]) setUsageEmail(validRecipients[0]);
              }}
            >
              {checkingUsage ? "Checking…" : "Check usage history"}
            </button>
          </div>
          <textarea
            ref={recipientsRef}
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            onPaste={handleRecipientsPaste}
            rows={5}
            placeholder="Paste emails — commas, spaces, or one per line"
            className="app-input resize-y font-mono text-xs leading-relaxed"
          />
          <p className="ui-hint">
            <strong className="font-semibold text-[var(--color-ink)]">{pasteRecipientCount}</strong>{" "}
            valid address{pasteRecipientCount === 1 ? "" : "es"}
            {csvFile ? " · CSV emails are merged on send" : ""}
          </p>

          {priorUsed.length > 0 && (
            <div className="mt-3 rounded-xl border border-[var(--color-warn)]/35 bg-[#fff8eb] px-3.5 py-3">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                {priorUsed.length} address{priorUsed.length === 1 ? "" : "es"} used before
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                Open the timeline to see what was sent and when.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {priorUsed.map((hit) => (
                  <li key={hit.email}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-left transition hover:border-[var(--color-accent)]"
                      onClick={() => setUsageEmail(hit.email)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs font-medium text-[var(--color-ink)]">
                          {hit.email}
                        </span>
                        <span className="mt-0.5 block truncate text-[0.7rem] text-[var(--color-ink-muted)]">
                          {hit.sentCount} sent
                          {hit.lastSubject ? ` · last: ${hit.lastSubject}` : ""}
                          {hit.lastActivityAt
                            ? ` · ${new Date(hit.lastActivityAt).toLocaleString()}`
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[0.7rem] font-semibold text-[var(--color-accent)]">
                        Timeline
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="ui-label">CSV list (optional)</span>
            <label className="ui-dropzone">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-sm font-semibold text-[var(--color-ink)]">
                {csvFile ? "Replace CSV" : "Drop CSV or click to browse"}
              </span>
              <span className="text-xs text-[var(--color-ink-muted)]">
                Email column preferred, otherwise first column
              </span>
            </label>
            {csvFile && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono" title={csvFile.name}>
                  {csvFile.name}
                </span>
                <button type="button" onClick={clearCsv} className="ui-btn ui-btn-ghost !px-2 !py-1 text-[11px]">
                  Remove
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="ui-label !mb-0">Attachments (optional)</span>
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllAttachments}
                  className="text-xs font-semibold text-[var(--color-danger)] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <label className="ui-dropzone">
              <input
                ref={attachmentsInputRef}
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <span className="text-sm font-semibold text-[var(--color-ink)]">
                {files.length ? "Add more files" : "Drop files or click to browse"}
              </span>
              <span className="text-xs text-[var(--color-ink-muted)]">
                Up to 10MB per file
              </span>
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono" title={f.name}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="ui-btn ui-btn-ghost !px-2 !py-1 text-[11px]"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[#f8fafc] p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--color-ink)]">Sending pace</p>
              <p className="ui-hint !mt-1">One email at a time — slow down if Gmail rate-limits you.</p>
            </div>
          </div>
          <div className="ui-segment max-w-md">
            <button
              type="button"
              data-active={sendMode === "instant" ? "true" : "false"}
              onClick={() => setSendMode("instant")}
            >
              Fast (~0.4s)
            </button>
            <button
              type="button"
              data-active={sendMode === "delayed" ? "true" : "false"}
              onClick={() => setSendMode("delayed")}
            >
              Custom delay
            </button>
          </div>
          {sendMode === "delayed" && (
            <label className="mt-3 flex flex-col gap-2 text-sm text-[var(--color-ink-muted)] sm:flex-row sm:items-center">
              <span>Seconds between emails</span>
              <input
                type="number"
                min={1}
                max={3600}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="app-input w-full max-w-[8rem] text-center tabular-nums"
              />
            </label>
          )}
        </div>

        {(submitting || liveCampaign) && (
          <CampaignStatusPanel
            campaign={
              liveCampaign ?? {
                id: "starting",
                status: "QUEUED",
                recipients: [],
              }
            }
            starting={submitting && !liveCampaign}
          />
        )}

        {error && <div className="ui-alert ui-alert-error">{error}</div>}

        {invalidList.length > 0 && (
          <div className="ui-alert ui-alert-warn">
            <p className="font-semibold">Invalid emails skipped</p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs">
              {invalidList.slice(0, 30).map((x) => (
                <li key={x}>{x}</li>
              ))}
              {invalidList.length > 30 && <li>…and {invalidList.length - 30} more</li>}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-ink-muted)]">
            Double-check recipients before you send.
          </p>
          <button type="submit" disabled={submitting} className="ui-btn ui-btn-primary w-full sm:w-auto">
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Sending…
              </>
            ) : (
              "Send campaign"
            )}
          </button>
        </div>
      </form>

      {usageEmail && (
        <RecipientUsageModal
          email={usageEmail}
          relatedEmails={priorUsed.map((h) => h.email)}
          onClose={() => setUsageEmail(null)}
          onViewOther={(next) => setUsageEmail(next)}
        />
      )}

      {(submitting || liveCampaign) && (
        <SendProgressDock
          campaign={liveCampaign}
          starting={submitting && !liveCampaign}
          onDismiss={
            liveCampaign && liveCampaign.status === "COMPLETED"
              ? () => {
                  setLiveCampaign(null);
                  setLastCampaignId(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function campaignCounts(campaign: CampaignDetail | null) {
  const counts = { SENT: 0, FAILED: 0, PENDING: 0 };
  for (const r of campaign?.recipients ?? []) {
    if (r.status === "SENT") counts.SENT += 1;
    else if (r.status === "FAILED") counts.FAILED += 1;
    else counts.PENDING += 1;
  }
  const total = campaign?.recipients.length ?? 0;
  const done = counts.SENT + counts.FAILED;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return { ...counts, total, progress };
}

function SendProgressDock({
  campaign,
  starting,
  onDismiss,
}: {
  campaign: CampaignDetail | null;
  starting?: boolean;
  onDismiss?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const { SENT, FAILED, PENDING, total, progress } = campaignCounts(campaign);
  const active = starting || campaign?.status === "QUEUED" || campaign?.status === "SENDING";

  return createPortal(
    <div
      data-overlay=""
      className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      style={{ position: "fixed", inset: "auto 0 0 0", zIndex: 450 }}
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-line)] bg-white/95 p-3 shadow-[0_-8px_32px_rgba(21,32,43,0.12)] backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {starting ? "Starting send…" : active ? "Sending in real time" : "Send finished"}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {total > 0
                ? `${SENT + FAILED} of ${total} finished · ${progress}%`
                : "Waiting for the first update"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="ui-chip">{starting ? "QUEUED" : campaign?.status ?? "QUEUED"}</span>
            {onDismiss && (
              <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={onDismiss}>
                Close
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e2e8f0]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${starting ? 8 : Math.max(progress, active ? 4 : 0)}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Sent" value={SENT} tone="ok" />
          <Stat label="Pending" value={PENDING} tone="warn" />
          <Stat label="Failed" value={FAILED} tone="danger" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CampaignStatusPanel({
  campaign,
  starting,
}: {
  campaign: CampaignDetail;
  starting?: boolean;
}) {
  const { SENT: sent, FAILED: failed, PENDING: pending, total, progress } = campaignCounts(campaign);

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[#f8fafc] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">
          {starting ? "Starting send…" : "Live progress"}
        </h3>
        <span className="ui-chip">{starting ? "QUEUED" : campaign.status}</span>
      </div>
      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
        {total} recipient{total === 1 ? "" : "s"} · {progress}% finished
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-[#e2e8f0]">
        <div
          className="h-full rounded bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Sent" value={sent} tone="ok" />
        <Stat label="Pending" value={pending} tone="warn" />
        <Stat label="Failed" value={failed} tone="danger" />
      </div>
      {failed > 0 && (
        <div className="mt-4 max-h-36 overflow-auto rounded-lg border border-[#fecdca] bg-[#fef3f2] p-3 text-xs text-[#912018]">
          <p className="font-semibold">Errors</p>
          <ul className="mt-2 space-y-1 font-mono">
            {campaign.recipients
              .filter((r) => r.status === "FAILED")
              .map((r) => (
                <li key={r.email}>
                  {r.email}: {r.errorMessage ?? "Unknown error"}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--color-ok)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : "text-[var(--color-danger)]";
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white py-2.5">
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </div>
    </div>
  );
}
