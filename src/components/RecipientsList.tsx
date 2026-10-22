"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CampaignDetailModal,
  type CampaignReusePayload,
} from "@/components/CampaignDetailModal";
import { ListPagination } from "@/components/ListPagination";
import { COMPOSER_REUSE_KEY } from "@/lib/composer-reuse";

type RecentCampaign = {
  campaignId: string;
  subject: string;
  campaignStatus: string;
  recipientStatus: string;
  senderEmail: string;
  createdAt: string;
  errorMessage: string | null;
};

type RecipientRow = {
  email: string;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  campaignCount: number;
  lastActivityAt: string | null;
  recentCampaigns: RecentCampaign[];
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function statusClass(status: string) {
  const s = status.toUpperCase();
  if (s === "SENT" || s === "COMPLETED") return "text-[var(--color-ok)]";
  if (s === "FAILED") return "text-[var(--color-danger)]";
  return "text-[var(--color-warn)]";
}

export function RecipientsList() {
  const router = useRouter();
  const [rows, setRows] = useState<RecipientRow[] | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const load = useCallback(async (page = pagination.page, pageSize = pagination.pageSize) => {
    try {
      const res = await fetch(`/api/recipients?page=${page}&pageSize=${pageSize}`);
      if (!res.ok) {
        setLoadError(true);
        setRows([]);
        return;
      }
      const data = await res.json();
      const mapped = data.recipients as RecipientRow[];
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
        const emails = new Set(mapped.map((r) => r.email.toLowerCase()));
        return new Set([...prev].filter((e) => emails.has(e.toLowerCase())));
      });
    } catch {
      setLoadError(true);
      setRows([]);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () =>
      !!rows &&
      rows.length > 0 &&
      rows.every((r) => selected.has(r.email.toLowerCase())),
    [rows, selected],
  );

  function toggleOne(email: string) {
    const key = email.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (!rows) return;
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.email.toLowerCase())));
  }

  function onReuse(payload: CampaignReusePayload) {
    try {
      sessionStorage.setItem(COMPOSER_REUSE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("composer:reuse", { detail: payload }));
    router.push("/");
  }

  async function reuseForRecipient(email: string, campaignId: string) {
    const key = `${email}:${campaignId}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
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
        recipientsText: email,
        attachments: c.attachments,
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteSelected() {
    const emails = [...selected];
    if (emails.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${emails.length} selected recipient${emails.length === 1 ? "" : "s"} from the database? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Delete failed");
        return;
      }
      setSelected(new Set());
      setActionOk(`Deleted ${data.deleted} recipient record${data.deleted === 1 ? "" : "s"}.`);
      await load();
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
        `Permanently delete ALL recipient records from the database? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/recipients", {
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
      setActionOk(`Deleted ${data.deleted} recipient record${data.deleted === 1 ? "" : "s"}.`);
      await load(1, pagination.pageSize);
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
        Could not load recipients. Try refreshing.
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
            No recipients yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Addresses you send to will appear here for reuse and follow-up.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((r) => {
            const open = expanded === r.email;
            const key = r.email.toLowerCase();
            return (
              <li key={key} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      disabled={busy}
                      onChange={() => toggleOne(r.email)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-line)]"
                      aria-label={`Select ${r.email}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setExpanded(open ? null : r.email)}
                    >
                      <p className="truncate font-mono text-sm font-medium text-[var(--color-ink)]">
                        {r.email}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        {r.campaignCount} campaign{r.campaignCount === 1 ? "" : "s"}
                        {" · "}
                        <span className="text-[var(--color-ok)]">{r.sentCount} sent</span>
                        {" · "}
                        <span className="text-[var(--color-warn)]">{r.pendingCount} pending</span>
                        {" · "}
                        <span className="text-[var(--color-danger)]">{r.failedCount} failed</span>
                        {r.lastActivityAt
                          ? ` · last ${new Date(r.lastActivityAt).toLocaleString()}`
                          : ""}
                      </p>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : r.email)}
                    className="ui-btn ui-btn-ghost w-full sm:w-auto"
                  >
                    {open ? "Hide" : "Emails"}
                  </button>
                </div>

                {open && (
                  <ul className="mt-3 space-y-2 border-t border-[var(--color-line)] pt-3">
                    {r.recentCampaigns.map((c) => {
                      const itemBusy = busyKey === `${r.email}:${c.campaignId}`;
                      return (
                        <li
                          key={`${c.campaignId}-${c.recipientStatus}-${c.createdAt}`}
                          className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[#f8fafc] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                              {c.subject}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                              {new Date(c.createdAt).toLocaleString()}
                              {" · "}
                              <span className={statusClass(c.recipientStatus)}>
                                {c.recipientStatus}
                              </span>
                              {c.errorMessage ? ` — ${c.errorMessage}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setViewId(c.campaignId)}
                              className="ui-btn ui-btn-ghost"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              disabled={itemBusy}
                              onClick={() => void reuseForRecipient(r.email, c.campaignId)}
                              className="ui-btn ui-btn-primary"
                            >
                              {itemBusy ? "Loading…" : "Edit & reuse"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
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
