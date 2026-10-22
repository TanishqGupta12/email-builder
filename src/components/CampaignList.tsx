"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CampaignDetailModal,
  type CampaignReusePayload,
} from "@/components/CampaignDetailModal";
import { COMPOSER_REUSE_KEY } from "@/lib/composer-reuse";

type Row = {
  id: string;
  subject: string;
  senderEmail: string;
  status: string;
  createdAt: string;
  sent: number;
  failed: number;
  pending: number;
  attachmentCount: number;
};

function statusChip(status: string) {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "ui-chip ui-chip-ok";
  if (s === "SENDING" || s === "QUEUED") return "ui-chip ui-chip-warn";
  return "ui-chip";
}

export function CampaignList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) {
        setLoadError(true);
        setRows([]);
        return;
      }
      const data = await res.json();
      const mapped: Row[] = (
        data.campaigns as {
          id: string;
          subject: string;
          senderEmail: string;
          status: string;
          createdAt: string;
          sent: number;
          failed: number;
          pending: number;
          attachments?: { id: string }[];
        }[]
      ).map((c) => ({
        id: c.id,
        subject: c.subject,
        senderEmail: c.senderEmail,
        status: c.status,
        createdAt: c.createdAt,
        sent: c.sent,
        failed: c.failed,
        pending: c.pending,
        attachmentCount: c.attachments?.length ?? 0,
      }));
      setLoadError(false);
      setRows(mapped);
    } catch {
      setLoadError(true);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    const onRefresh = () => void load();
    window.addEventListener("campaigns:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("campaigns:refresh", onRefresh);
    };
  }, [load]);

  function onReuse(payload: CampaignReusePayload) {
    try {
      sessionStorage.setItem(COMPOSER_REUSE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
    window.dispatchEvent(new CustomEvent("composer:reuse", { detail: payload }));
    router.push("/");
  }

  if (!rows) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <div className="h-16 animate-pulse rounded-xl bg-[#eef2f6]" />
        <div className="h-16 animate-pulse rounded-xl bg-[#eef2f6]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--color-danger)] sm:px-6">
        Could not load campaigns. Try refreshing.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-12 text-center sm:px-6">
        <p className="font-display text-base font-semibold text-[var(--color-ink)]">Nothing sent yet</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Your campaigns will show up here after the first send.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-[var(--color-line)]">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#f8fafc] sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium text-[var(--color-ink)]" title={r.subject}>
                  {r.subject}
                </p>
                <span className={statusChip(r.status)}>{r.status}</span>
              </div>
              <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">
                {r.senderEmail} · {new Date(r.createdAt).toLocaleString()}
                {r.attachmentCount > 0
                  ? ` · ${r.attachmentCount} file${r.attachmentCount === 1 ? "" : "s"}`
                  : ""}
              </p>
              <p className="mt-2 text-xs tabular-nums text-[var(--color-ink-muted)]">
                <span className="text-[var(--color-ok)]">{r.sent} sent</span>
                {" · "}
                <span className="text-[var(--color-warn)]">{r.pending} pending</span>
                {" · "}
                <span className="text-[var(--color-danger)]">{r.failed} failed</span>
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => setViewId(r.id)}
                className="ui-btn ui-btn-ghost w-full sm:w-auto"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const res = await fetch(`/api/campaigns/${r.id}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    const c = data.campaign as {
                      id: string;
                      senderEmail: string;
                      subject: string;
                      bodyHtml: string;
                      attachments: {
                        id: string;
                        originalName: string;
                        mimeType: string;
                        size: number;
                      }[];
                    };
                    onReuse({
                      campaignId: c.id,
                      senderEmail: c.senderEmail,
                      subject: c.subject,
                      bodyHtml: c.bodyHtml,
                      attachments: c.attachments,
                    });
                  })();
                }}
                className="ui-btn ui-btn-primary w-full sm:w-auto"
              >
                Reuse
              </button>
            </div>
          </li>
        ))}
      </ul>

      {viewId && (
        <CampaignDetailModal
          campaignId={viewId}
          onClose={() => setViewId(null)}
          onReuse={onReuse}
        />
      )}
    </>
  );
}
