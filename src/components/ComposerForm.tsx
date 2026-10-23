"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  extractEmailsFromPaste,
  parseEmailPaste,
  partitionEmails,
} from "@/lib/recipients";
import type { CampaignReusePayload } from "@/components/CampaignDetailModal";
import { RecipientUsageModal } from "@/components/RecipientUsageModal";
import { CampaignStatusPanel, useSendProgress } from "@/components/SendProgressProvider";
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
  const { campaign: liveCampaign, starting: sendStarting, startSend } = useSendProgress();
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setReuseNotice(null);
    setInvalidList([]);
    setSubmitting(true);

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

    const result = await startSend(fd, subject);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      if (result.invalid?.length) setInvalidList(result.invalid);
      return;
    }
    if (result.invalid?.length) setInvalidList(result.invalid);
  }

  return (
    <>
      <form onSubmit={onSubmit} className="min-w-0 space-y-6">
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

        {(submitting || sendStarting || liveCampaign) && (
          <CampaignStatusPanel
            campaign={
              liveCampaign ?? {
                id: "starting",
                status: "QUEUED",
                recipients: [],
              }
            }
            starting={(submitting || sendStarting) && !liveCampaign}
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

    </>
  );
}
