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

const STORAGE_KEY = "postline:wa-live-send";

export type LiveBroadcast = {
  id: string;
  status: string;
  message?: string;
  duplicateCount?: number;
  recipients: { phone: string; status: string; errorMessage: string | null }[];
};

type StoredWatch = {
  id: string;
  message?: string;
  minimized: boolean;
  duplicateCount?: number;
};

type StartResult =
  | { ok: true; invalid?: string[] }
  | { ok: false; error: string; invalid?: string[] };

type WaSendProgressValue = {
  broadcast: LiveBroadcast | null;
  starting: boolean;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  startSend: (fd: FormData, message?: string) => Promise<StartResult>;
  dismiss: () => void;
};

const WaSendProgressContext = createContext<WaSendProgressValue | null>(null);

export function useWaSendProgress() {
  const ctx = useContext(WaSendProgressContext);
  if (!ctx) throw new Error("useWaSendProgress must be used inside WaSendProgressProvider");
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
    /* ignore quota errors */
  }
}

export function broadcastCounts(broadcast: LiveBroadcast | null) {
  const counts = { SENT: 0, FAILED: 0, PENDING: 0 };
  for (const recipient of broadcast?.recipients ?? []) {
    if (recipient.status === "SENT") counts.SENT += 1;
    else if (recipient.status === "FAILED") counts.FAILED += 1;
    else counts.PENDING += 1;
  }
  const total = broadcast?.recipients.length ?? 0;
  const done = counts.SENT + counts.FAILED;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  return { ...counts, total, progress };
}

export function WaSendProgressProvider({ children }: { children: React.ReactNode }) {
  const [broadcast, setBroadcast] = useState<LiveBroadcast | null>(null);
  const [starting, setStarting] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [minimized, setMinimizedState] = useState(false);
  const [ready, setReady] = useState(false);
  const duplicateCountRef = useRef(0);

  const setMinimized = useCallback(
    (value: boolean) => {
      setMinimizedState(value);
      if (watchId) {
        writeStored({
          id: watchId,
          message,
          minimized: value,
          duplicateCount: duplicateCountRef.current,
        });
      }
    },
    [message, watchId],
  );

  const dismiss = useCallback(() => {
    setBroadcast(null);
    setStarting(false);
    setWatchId(null);
    setMessage(undefined);
    setMinimizedState(false);
    duplicateCountRef.current = 0;
    writeStored(null);
  }, []);

  const watch = useCallback((next: LiveBroadcast, mini = false) => {
    const duplicateCount = next.duplicateCount ?? 0;
    duplicateCountRef.current = duplicateCount;
    setStarting(false);
    setBroadcast({ ...next, duplicateCount });
    setWatchId(next.id);
    setMessage(next.message);
    setMinimizedState(mini);
    writeStored({
      id: next.id,
      message: next.message,
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
      setMessage(stored.message);
      setMinimizedState(stored.minimized);
      setBroadcast({
        id: stored.id,
        status: "SENDING",
        message: stored.message,
        duplicateCount,
        recipients: [],
      });
    }
    setReady(true);
  }, []);

  const startSend = useCallback(
    async (fd: FormData, nextMessage?: string): Promise<StartResult> => {
      setStarting(true);
      setBroadcast(null);
      setMessage(nextMessage);
      try {
        const res = await fetch("/api/whatsapp/broadcasts", { method: "POST", body: fd });
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
          message: nextMessage,
          duplicateCount,
          recipients: Array.from({ length: count }, (_, i) => ({
            phone: `pending-${i}`,
            status: "PENDING",
            errorMessage: null,
          })),
        });
        window.dispatchEvent(new Event("whatsapp:refresh"));
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
        const res = await fetch(`/api/whatsapp/broadcasts/${watchId}`);
        if (!res.ok) {
          if (res.status === 404) dismiss();
          return;
        }
        const data = await res.json();
        const next = data.broadcast as LiveBroadcast;
        if (stopped || !next) return;
        setBroadcast((current) => ({
          ...next,
          message: next.message ?? current?.message ?? message,
          duplicateCount: current?.duplicateCount ?? duplicateCountRef.current,
        }));
        window.dispatchEvent(new Event("whatsapp:refresh"));
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
  }, [dismiss, message, ready, watchId]);

  useEffect(() => {
    const visible = starting || !!broadcast;
    const pad = !visible ? "" : minimized ? "5.5rem" : "11.5rem";
    document.body.style.paddingBottom = pad;
    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [broadcast, minimized, starting]);

  const value = useMemo(
    () => ({
      broadcast,
      starting,
      minimized,
      setMinimized,
      startSend,
      dismiss,
    }),
    [broadcast, dismiss, minimized, setMinimized, startSend, starting],
  );

  const visible = starting || !!broadcast;

  return (
    <WaSendProgressContext.Provider value={value}>
      {children}
      {visible && (
        <WaSendDock
          broadcast={broadcast}
          starting={starting && !broadcast}
          minimized={minimized}
          onToggle={() => setMinimized(!minimized)}
          onDismiss={broadcast?.status === "COMPLETED" ? dismiss : undefined}
        />
      )}
    </WaSendProgressContext.Provider>
  );
}

function WaSendDock({
  broadcast,
  starting,
  minimized,
  onToggle,
  onDismiss,
}: {
  broadcast: LiveBroadcast | null;
  starting?: boolean;
  minimized: boolean;
  onToggle: () => void;
  onDismiss?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const { SENT, FAILED, PENDING, total, progress } = broadcastCounts(broadcast);
  const duplicates = broadcast?.duplicateCount ?? 0;
  const active = starting || broadcast?.status === "QUEUED" || broadcast?.status === "SENDING";
  const title = starting ? "Starting alerts…" : active ? "Sending one by one" : "Alerts finished";
  const preview = broadcast?.message?.trim();

  return createPortal(
    <div
      data-overlay=""
      className="wa-dock px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
      style={{ position: "fixed", inset: "auto 0 0 0", zIndex: 450, pointerEvents: "none" }}
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-[#b7d8cc] bg-white/95 shadow-[0_-8px_32px_rgba(16,36,28,0.14)] backdrop-blur"
        style={{ padding: minimized ? "0.7rem 0.85rem" : undefined }}
      >
        <div className={minimized ? "" : "p-3 sm:p-4"}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display truncate text-sm font-semibold text-[var(--color-ink)]">
                {title}
                {preview ? (
                  <span className="font-normal text-[var(--color-ink-muted)]"> · {preview}</span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                {total > 0
                  ? `${SENT} sent · ${PENDING} pending · ${FAILED} failed · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} · ${progress}%`
                  : "Waiting for the first update"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!minimized && (
                <span className="ui-chip">{starting ? "QUEUED" : broadcast?.status ?? "QUEUED"}</span>
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
          <div className={`${minimized ? "mt-2" : "mt-3"} h-2 overflow-hidden rounded-full bg-[#d7ebe3]`}>
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
              style={{ width: `${starting ? 8 : Math.max(progress, active ? 4 : 0)}%` }}
            />
          </div>
          {!minimized && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <DockStat label="Sent" value={SENT} />
              <DockStat label="Pending" value={PENDING} />
              <DockStat label="Failed" value={FAILED} />
              <DockStat label="Duplicates" value={duplicates} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DockStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#f3faf7] px-2 py-2">
      <p className="font-display text-lg font-semibold text-[var(--color-ink)]">{value}</p>
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </p>
    </div>
  );
}
