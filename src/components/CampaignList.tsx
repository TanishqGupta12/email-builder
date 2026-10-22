"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CampaignDetailModal,
  type CampaignReusePayload,
} from "@/components/CampaignDetailModal";
import { ListPagination } from "@/components/ListPagination";
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

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function statusChip(status: string) {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return "ui-chip ui-chip-ok";
  if (s === "SENDING" || s === "QUEUED") return "ui-chip ui-chip-warn";
  return "ui-chip";
}

function canRetryRow(r: Row) {
  return r.pending > 0 || r.failed > 0;
}

export function CampaignList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [loadError, setLoadError] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const load = useCallback(async (page = pagination.page, pageSize = pagination.pageSize) => {
    try {
      const res = await fetch(`/api/campaigns?page=${page}&pageSize=${pageSize}`);
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
      const p = data.pagination as Pagination;
      setLoadError(false);
      setRows(mapped);
      setPagination({
        page: p.page,
        pageSize: p.pageSize,
        total: p.total,
        totalPages: p.totalPages,
      });
      setSelected((prev) => {
        const ids = new Set(mapped.map((r) => r.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch {
      setLoadError(true);
      setRows([]);
    }
  }, [pagination.page, pagination.pageSize]);

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

  const allSelected = useMemo(
    () => !!rows && rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (!rows) return;
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  }

  function onReuse(payload: CampaignReusePayload) {
    try {
      sessionStorage.setItem(COMPOSER_REUSE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
    window.dispatchEvent(new CustomEvent("composer:reuse", { detail: payload }));
    router.push("/");
  }

  async function retryCampaign(id: string) {
    setRetryingId(id);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeFailed: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Retry failed");
        return;
      }
      await load();
    } catch {
      setActionError("Network error while retrying");
    } finally {
      setRetryingId(null);
    }
  }

  async function reuseCampaign(id: string) {
    const res = await fetch(`/api/campaigns/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const c = data.campaign as {
      id: string;
      senderEmail: string;
      subject: string;
      bodyHtml: string;
      recipients: { email: string }[];
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
      recipientsText: c.recipients.map((r) => r.email).join("\n"),
      attachments: c.attachments,
    });
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${ids.length} selected campaign${ids.length === 1 ? "" : "s"} from the database? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Delete failed");
        return;
      }
      setSelected(new Set());
      setActionOk(`Deleted ${data.deleted} campaign${data.deleted === 1 ? "" : "s"}.`);
      await load();
      window.dispatchEvent(new Event("campaigns:refresh"));
    } catch {
      setActionError("Network error while deleting");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    if (pagination.total === 0) return;
    if (
      !window.confirm(
        `Permanently delete ALL ${pagination.total} campaigns from the database? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Bulk delete failed");
        return;
      }
      setSelected(new Set());
      setActionOk(`Deleted ${data.deleted} campaign${data.deleted === 1 ? "" : "s"}.`);
      await load(1, pagination.pageSize);
      window.dispatchEvent(new Event("campaigns:refresh"));
    } catch {
      setActionError("Network error while deleting");
    } finally {
      setBusy(false);
    }
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

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-[var(--color-line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={rows.length === 0 || busy}
            onChange={toggleAllOnPage}
            className="h-4 w-4 rounded border-[var(--color-line)]"
          />
          Select all on page
          {selected.size > 0 ? (
            <span className="text-[var(--color-ink-muted)]">({selected.size} selected)</span>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void deleteSelected()}
            className="ui-btn ui-btn-danger"
          >
            Delete selected
          </button>
          <button
            type="button"
            disabled={busy || pagination.total === 0}
            onClick={() => void deleteAll()}
            className="ui-btn ui-btn-ghost"
          >
            Delete all
          </button>
        </div>
      </div>

      {(actionError || actionOk) && (
        <div className="border-b border-[var(--color-line)] px-4 py-3 sm:px-5">
          {actionError && <div className="ui-alert ui-alert-error">{actionError}</div>}
          {actionOk && <div className="ui-alert ui-alert-ok">{actionOk}</div>}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-12 text-center sm:px-6">
          <p className="font-display text-base font-semibold text-[var(--color-ink)]">
            Nothing sent yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Your campaigns will show up here after the first send.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#f8fafc] sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  disabled={busy}
                  onChange={() => toggleOne(r.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-line)]"
                  aria-label={`Select ${r.subject}`}
                />
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
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => setViewId(r.id)}
                  className="ui-btn ui-btn-ghost w-full sm:w-auto"
                >
                  View
                </button>
                {canRetryRow(r) && (
                  <button
                    type="button"
                    disabled={retryingId === r.id || busy}
                    onClick={() => void retryCampaign(r.id)}
                    className="ui-btn ui-btn-ghost w-full sm:w-auto"
                  >
                    {retryingId === r.id ? "Retrying…" : "Retry"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void reuseCampaign(r.id)}
                  className="ui-btn ui-btn-primary w-full sm:w-auto"
                >
                  Reuse
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ListPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        totalPages={pagination.totalPages}
        disabled={busy}
        onPageChange={(page) => void load(page, pagination.pageSize)}
        onPageSizeChange={(pageSize) => void load(1, pageSize)}
      />

      {viewId && (
        <CampaignDetailModal
          campaignId={viewId}
          onClose={() => setViewId(null)}
          onReuse={onReuse}
          onRetried={() => void load()}
        />
      )}
    </>
  );
}
