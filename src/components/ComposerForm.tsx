"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  extractEmailsFromPaste,
  parseEmailPaste,
  partitionEmails,
} from "@/lib/recipients";

const RichTextEditor = dynamic(
  () => import("@/components/RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[260px] animate-pulse rounded-xl border border-blue-900/50 bg-slate-950/50" />
    ),
  },
);

type CampaignDetail = {
  id: string;
  status: string;
  recipients: { email: string; status: string; errorMessage: string | null }[];
};

const labelClass = "text-sm font-medium text-slate-200";
const inputClass =
  "app-input w-full px-3 py-2.5 text-sm placeholder:text-slate-500";

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
  const submitLockRef = useRef(false);

  const pasteRecipientCount = useMemo(() => {
    const { valid } = partitionEmails(parseEmailPaste(recipientsText));
    return valid.length;
  }, [recipientsText]);

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
              return empty ? msg : prev;
            });
          }
        },
      )
      .catch(() => {});
  }, []);

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
    let cancelled = false;
    const tick = async () => {
      const c = await pollCampaign(lastCampaignId);
      if (cancelled || !c) return;
      setLiveCampaign(c);
      if (c.status === "SENDING" || c.status === "QUEUED") {
        setTimeout(tick, 1500);
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [lastCampaignId, pollCampaign]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      if (Array.isArray(data.invalid) && data.invalid.length) {
        setInvalidList(data.invalid);
      }
    } catch {
      setError("Network error");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
    {liveCampaign && <CampaignStatusPanel campaign={liveCampaign} />}
    <form onSubmit={onSubmit} className="min-w-0 space-y-5 sm:space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className={labelClass}>Sender email</span>
          <input
            type="email"
            required
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder={defaultSender || "you@gmail.com"}
            className={inputClass}
          />
        </label>
        <label className="block space-y-2 sm:col-span-2">
          <span className={labelClass}>Subject</span>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
            placeholder="Email subject"
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className={labelClass}>Message</span>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
      </div>

      <div className="space-y-6">
        <label className="block space-y-2">
          <span className={labelClass}>Recipients (paste)</span>
          <textarea
            ref={recipientsRef}
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            onPaste={handleRecipientsPaste}
            rows={6}
            placeholder={"Paste any mix: commas, spaces, or lines — they separate automatically"}
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
          <p className="text-xs leading-relaxed text-slate-500">
            <span className="font-medium text-slate-400">{pasteRecipientCount}</span> valid address
            {pasteRecipientCount === 1 ? "" : "es"} in the box above
            {csvFile ? (
              <span className="text-amber-200/90">
                {" "}
                · CSV attached — those emails are added too when you send
              </span>
            ) : null}
            . <span className="text-slate-600">Do not paste the message HTML here — only recipient addresses.</span>
          </p>
        </label>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className={labelClass}>CSV upload</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              Uses an <code className="rounded bg-blue-950/80 px-1 py-0.5 text-blue-200/90">email</code>{" "}
              column if present; otherwise the first column.
            </p>
          </label>
          <label className="block space-y-2">
            <span className={labelClass}>Attachments</span>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
            />
            {files.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-500">
                {files.map((f) => (
                  <li key={f.name + f.size} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                    {f.name} ({Math.round(f.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            )}
          </label>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-blue-900/50 bg-blue-950/20 p-4 sm:space-y-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-100">Sending</legend>
        <p className="text-xs leading-relaxed text-slate-500">
          Recipients are emailed <strong className="text-slate-400">one by one</strong> in list order
          (separate SMTP message per address). A short gap is added between sends so Gmail is less
          likely to throttle.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
          <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-sm text-slate-200 sm:items-center">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "instant"}
              onChange={() => setSendMode("instant")}
              className="h-4 w-4 border-blue-500/50 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            Default gap (~0.4s between each)
          </label>
          <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-sm text-slate-200 sm:items-center">
            <input
              type="radio"
              name="sendMode"
              checked={sendMode === "delayed"}
              onChange={() => setSendMode("delayed")}
              className="h-4 w-4 border-blue-500/50 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            Custom delay (rate limit)
          </label>
        </div>
        {sendMode === "delayed" && (
          <label className="flex flex-col gap-2 text-sm text-slate-300 sm:flex-row sm:flex-wrap sm:items-center">
            <span>Seconds between each email</span>
            <input
              type="number"
              min={1}
              max={3600}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="app-input w-full max-w-[10rem] px-2 py-2 text-center tabular-nums sm:w-24 sm:py-1.5"
            />
          </label>
        )}
      </fieldset>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100 shadow-inner">
          {error}
        </div>
      )}

      {invalidList.length > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-3 text-sm text-amber-50">
          <p className="font-semibold text-amber-200">Invalid emails (skipped)</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs text-amber-100/90">
            {invalidList.slice(0, 30).map((x) => (
              <li key={x}>{x}</li>
            ))}
            {invalidList.length > 30 && <li>…and {invalidList.length - 30} more</li>}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/50 transition hover:from-blue-500 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Sending…
          </>
        ) : (
          "Send campaign"
        )}
      </button>

    </form>
    </>
  );
}

function CampaignStatusPanel({ campaign }: { campaign: CampaignDetail }) {
  const counts = campaign.recipients.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sent = counts.SENT ?? 0;
  const failed = counts.FAILED ?? 0;
  const pending = counts.PENDING ?? 0;
  const total = campaign.recipients.length;

  return (
    <div className="mb-5 min-w-0 rounded-xl border border-blue-900/50 bg-blue-950/30 p-4 shadow-inner sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Campaign status</h3>
        <span className="rounded-full border border-blue-700/50 bg-blue-950/80 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-200">
          {campaign.status}
        </span>
      </div>
      <p className="mt-2 min-w-0 text-xs leading-relaxed text-slate-400">
        <strong className="text-slate-300">{total} recipient addresses</strong> in this send (from
        Recipients + CSV). <strong className="text-slate-300">Pending</strong> = still queued;
        <strong className="text-slate-300"> Sent</strong> = delivered. Your <em>sender</em> email is
        separate — it does not add to these numbers.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Sends go one-by-one; use custom delay if Gmail rate-limits you.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/35 px-2 py-3">
          <div className="text-xl font-semibold tabular-nums text-emerald-400">{sent}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/80">
            Sent
          </div>
        </div>
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 px-2 py-3">
          <div className="text-xl font-semibold tabular-nums text-amber-300">{pending}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/80">
            Pending
          </div>
        </div>
        <div className="rounded-lg border border-red-800/40 bg-red-950/35 px-2 py-3">
          <div className="text-xl font-semibold tabular-nums text-red-400">{failed}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80">
            Failed
          </div>
        </div>
      </div>
      {failed > 0 && (
        <div className="mt-4 max-h-40 overflow-auto rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs">
          <p className="font-semibold text-red-400">SMTP / send errors</p>
          <ul className="mt-2 space-y-1.5 font-mono text-red-100/90">
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
