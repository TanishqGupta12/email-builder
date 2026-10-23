"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "postline:live-send";

export type LiveCampaign = {
  id: string;
  status: string;
  subject?: string;
  duplicateCount?: number;
  recipients: { email: string; status: string; errorMessage: string | null }[];
};

type StoredWatch = {
  id: string;
  subject?: string;
  minimized: boolean;
  duplicateCount?: number;
};

type StartResult =
  | { ok: true; invalid?: string[] }
  | { ok: false; error: string; invalid?: string[] };

type SendProgressValue = {
  campaign: LiveCampaign | null;
  starting: boolean;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  begin: () => void;
  startSend: (fd: FormData, subject?: string) => Promise<StartResult>;
  dismiss: () => void;
};

const SendProgressContext = createContext<SendProgressValue | null>(null);

export function useSendProgress() {
  const ctx = useContext(SendProgressContext);
  if (!ctx) throw new Error("useSendProgress must be used inside SendProgressProvider");
  return ctx;
}

function readStored(): StoredWatch | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWatch;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(value: StoredWatch | null) {
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function SendProgressProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaign] = useState<LiveCampaign | null>(null);
  const [starting, setStarting] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | undefined>();
  const [minimized, setMinimizedState] = useState(false);
  const [ready, setReady] = useState(false);
  const duplicateCountRef = useRef(0);

  const setMinimized = useCallback(
    (value: boolean) => {
      setMinimizedState(value);
      if (watchId) {
        writeStored({
          id: watchId,
          subject,
          minimized: value,
          duplicateCount: duplicateCountRef.current,
        });
      }
    },
    [subject, watchId],
  );

  const dismiss = useCallback(() => {
    setCampaign(null);
    setStarting(false);
    setWatchId(null);
    setSubject(undefined);
    setMinimizedState(false);
    duplicateCountRef.current = 0;
    writeStored(null);
  }, []);

  const begin = useCallback(() => {
    setStarting(true);
    setCampaign(null);
  }, []);

  const watch = useCallback((next: LiveCampaign, mini = false) => {
    const duplicateCount = next.duplicateCount ?? 0;
    duplicateCountRef.current = duplicateCount;
    setStarting(false);
    setCampaign({ ...next, duplicateCount });
    setWatchId(next.id);
    setSubject(next.subject);
    setMinimizedState(mini);
    writeStored({
      id: next.id,
      subject: next.subject,
      minimized: mini,
      duplicateCount,
    });
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      const duplicateCount = stored.duplicateCount ?? 0;
      duplicateCountRef.current = duplicateCount;
      setWatchId(stored.id);
      setSubject(stored.subject);
      setMinimizedState(stored.minimized);
      setCampaign({
        id: stored.id,
        status: "SENDING",
        subject: stored.subject,
        duplicateCount,
        recipients: [],
      });
    }
    setReady(true);
  }, []);

  const startSend = useCallback(
    async (fd: FormData, nextSubject?: string): Promise<StartResult> => {
      setStarting(true);
      setCampaign(null);
      setSubject(nextSubject);
      try {
        const res = await fetch("/api/campaigns", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setStarting(false);
          return {
            ok: false,
            error: data.error ?? "Request failed",
            invalid: Array.isArray(data.invalid) ? data.invalid : undefined,
          };
        }
        const count = Number(data.recipientCount) || 0;
        const duplicateCount = Number(data.duplicateCount) || 0;
        watch({
          id: data.id,
          status: "QUEUED",
          subject: nextSubject,
          duplicateCount,
          recipients: Array.from({ length: count }, (_, i) => ({
            email: `pending-${i}`,
            status: "PENDING",
            errorMessage: null,
          })),
        });
        window.dispatchEvent(new Event("campaigns:refresh"));
        return {
          ok: true,
          invalid: Array.isArray(data.invalid) ? data.invalid : undefined,
        };
      } catch {
        setStarting(false);
        return { ok: false, error: "Network error" };
      }
    },
    [watch],
  );

  useEffect(() => {
    if (!ready || !watchId) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/campaigns/${watchId}`);
        if (!res.ok) {
          if (res.status === 404) dismiss();
          return;
        }
        const data = await res.json();
        const next = data.campaign as LiveCampaign;
        if (stopped || !next) return;
        setCampaign((current) => ({
          ...next,
          subject: next.subject ?? current?.subject ?? subject,
          duplicateCount: current?.duplicateCount ?? duplicateCountRef.current,
        }));
        window.dispatchEvent(new Event("campaigns:refresh"));
        if (next.status === "COMPLETED") {
          stopped = true;
          window.clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    };
    void tick();
    timer = window.setInterval(() => void tick(), 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [dismiss, ready, subject, watchId]);

  useEffect(() => {
    const visible = starting || !!campaign;
    const pad = !visible ? "" : minimized ? "5.5rem" : "11.5rem";
    document.body.style.paddingBottom = pad;
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [campaign, minimized, starting]);

  const value = useMemo(
    () => ({
      campaign,
      starting,
      minimized,
      setMinimized,
      begin,
      startSend,
      dismiss,
    }),
    [begin, campaign, dismiss, minimized, setMinimized, startSend, starting],
  );

  const visible = starting || !!campaign;

  return (
    <SendProgressContext.Provider value={value}>
      {children}
      {visible && (
        <SendProgressDock
          campaign={campaign}
          starting={starting && !campaign}
          minimized={minimized}
          onToggle={() => setMinimized(!minimized)}
          onDismiss={campaign?.status === "COMPLETED" ? dismiss : undefined}
        />
      )}
    </SendProgressContext.Provider>
  );
}

export function campaignCounts(campaign: LiveCampaign | null) {
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
  minimized,
  onToggle,
  onDismiss,
}: {
  campaign: LiveCampaign | null;
  starting?: boolean;
  minimized: boolean;
  onToggle: () => void;
  onDismiss?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const { SENT, FAILED, PENDING, total, progress } = campaignCounts(campaign);
  const duplicates = campaign?.duplicateCount ?? 0;
  const active = starting || campaign?.status === "QUEUED" || campaign?.status === "SENDING";
  const title = starting ? "Starting send…" : active ? "Sending in real time" : "Send finished";
  const subjectLine = campaign?.subject?.trim();

  return createPortal(
    <div
      data-overlay=""
      className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      style={{ position: "fixed", inset: "auto 0 0 0", zIndex: 450, pointerEvents: "none" }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-[var(--color-line)] bg-white/95 shadow-[0_-8px_32px_rgba(21,32,43,0.12)] backdrop-blur"
        style={{ padding: minimized ? "0.7rem 0.85rem" : undefined }}
      >
        <div className={minimized ? "" : "p-3 sm:p-4"}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display truncate text-sm font-semibold text-[var(--color-ink)]">
                {title}
                {subjectLine ? <span className="font-normal text-[var(--color-ink-muted)]"> · {subjectLine}</span> : null}
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                {total > 0
                  ? `${SENT} sent · ${PENDING} pending · ${FAILED} failed · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} · ${progress}%`
                  : "Waiting for the first update"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!minimized && (
                <span className="ui-chip">{starting ? "QUEUED" : campaign?.status ?? "QUEUED"}</span>
              )}
              <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={onToggle}>
                {minimized ? "Open" : "Mini"}
              </button>
              {onDismiss && (
                <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={onDismiss}>
                  Close
                </button>
              )}
            </div>
          </div>
          <div className={`${minimized ? "mt-2" : "mt-3"} h-2 overflow-hidden rounded-full bg-[#e2e8f0]`}>
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
              style={{ width: `${starting ? 8 : Math.max(progress, active ? 4 : 0)}%` }}
            />
          </div>
          {!minimized && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <Stat label="Sent" value={SENT} tone="ok" />
              <Stat label="Pending" value={PENDING} tone="warn" />
              <Stat label="Failed" value={FAILED} tone="danger" />
              <Stat label="Duplicates" value={duplicates} tone="neutral" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CampaignStatusPanel({
  campaign,
  starting,
}: {
  campaign: LiveCampaign;
  starting?: boolean;
}) {
  const { SENT: sent, FAILED: failed, PENDING: pending, total, progress } = campaignCounts(campaign);
  const duplicates = campaign.duplicateCount ?? 0;

  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[#f8fafc] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">
          {starting ? "Starting send…" : "Live progress"}
        </h3>
        <span className="ui-chip">{starting ? "QUEUED" : campaign.status}</span>
      </div>
      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
        {total} recipient{total === 1 ? "" : "s"} · {duplicates} duplicate{duplicates === 1 ? "" : "s"} · {progress}% finished
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-[#e2e8f0]">
        <div
          className="h-full rounded bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <Stat label="Sent" value={sent} tone="ok" />
        <Stat label="Pending" value={pending} tone="warn" />
        <Stat label="Failed" value={failed} tone="danger" />
        <Stat label="Duplicates" value={duplicates} tone="neutral" />
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
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--color-ok)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "danger"
          ? "text-[var(--color-danger)]"
          : "text-[var(--color-ink)]";
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-white py-2.5">
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </div>
    </div>
  );
}
