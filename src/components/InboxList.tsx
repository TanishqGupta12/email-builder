"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  InboxMessageModal,
  type InboxReusePayload,
} from "@/components/InboxMessageModal";
import { ListPagination } from "@/components/ListPagination";
import { COMPOSER_REUSE_KEY } from "@/lib/composer-reuse";

type Row = {
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  date: string | null;
  seen: boolean;
  preview: string;
  hasAttachments: boolean;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function InboxList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewUid, setViewUid] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const load = useCallback(async (page = pagination.page, pageSize = pagination.pageSize) => {
    try {
      const res = await fetch(`/api/inbox?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load inbox");
        setRows([]);
        return;
      }
      setLoadError(null);
      setRows(data.messages as Row[]);
      const p = data.pagination as Pagination;
      setPagination({
        page: p.page,
        pageSize: p.pageSize,
        total: p.total,
        totalPages: p.totalPages,
      });
      setSelected((prev) => {
        const ids = new Set((data.messages as Row[]).map((r) => r.uid));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch {
      setLoadError("Network error while loading inbox");
      setRows([]);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () => !!rows && rows.length > 0 && rows.every((r) => selected.has(r.uid)),
    [rows, selected],
  );

  function toggleOne(uid: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (!rows) return;
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.uid)));
  }

  function onUseAsNew(payload: InboxReusePayload) {
    const reuse = {
      campaignId: "inbox",
      senderEmail: payload.senderEmail,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      recipientsText: payload.recipientsText,
      attachments: [] as {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
      }[],
    };
    try {
      sessionStorage.setItem(COMPOSER_REUSE_KEY, JSON.stringify(reuse));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("composer:reuse", { detail: reuse }));
    router.push("/");
  }

  async function deleteSelected() {
    const uids = [...selected];
    if (uids.length === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${uids.length} selected email${uids.length === 1 ? "" : "s"} from your inbox?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/inbox", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Delete failed");
        return;
      }
      setSelected(new Set());
      setActionOk(`Deleted ${data.deleted} email${data.deleted === 1 ? "" : "s"}.`);
      await load();
    } catch {
      setActionError("Network error while deleting");
    } finally {
      setBusy(false);
    }
  }

  async function markSelected(seen: boolean) {
    const uids = [...selected];
    if (uids.length === 0) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uids, seen }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Update failed");
        return;
      }
      setActionOk(`Marked ${data.updated} email${data.updated === 1 ? "" : "s"} as ${seen ? "read" : "unread"}.`);
      await load();
    } catch {
      setActionError("Network error while updating");
    } finally {
      setBusy(false);
    }
  }

  if (!rows) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <div className="h-16 animate-pulse rounded-xl bg-[#eef2f6]" />
        <div className="h-16 animate-pulse rounded-xl bg-[#eef2f6]" />
        <p className="text-center text-xs text-[var(--color-ink-muted)]">Connecting to inbox…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3 px-4 py-10 text-center sm:px-6">
        <p className="text-sm text-[var(--color-danger)]">{loadError}</p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Use the same Gmail app password on Connection. IMAP uses imap.gmail.com automatically.
        </p>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => void load()}>
          Try again
        </button>
      </div>
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
            onClick={() => void markSelected(true)}
            className="ui-btn ui-btn-ghost"
          >
            Mark read
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => void markSelected(false)}
            className="ui-btn ui-btn-ghost"
          >
            Mark unread
          </button>
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
            disabled={busy}
            onClick={() => void load()}
            className="ui-btn ui-btn-ghost"
          >
            Refresh
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
          <p className="font-display text-base font-semibold text-[var(--color-ink)]">Inbox empty</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            New mail will show up here when it arrives.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {rows.map((r) => {
            const from =
              r.fromName && r.fromEmail
                ? `${r.fromName} <${r.fromEmail}>`
                : r.fromEmail || r.fromName || "Unknown sender";
            return (
              <li
                key={r.uid}
                className={`flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#f8fafc] sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
                  r.seen ? "" : "bg-[var(--color-accent-soft)]/40"
                }`}
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.uid)}
                    disabled={busy}
                    onChange={() => toggleOne(r.uid)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--color-line)]"
                    aria-label={`Select ${r.subject}`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setViewUid(r.uid)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`truncate text-sm text-[var(--color-ink)] ${
                          r.seen ? "font-medium" : "font-semibold"
                        }`}
                        title={r.subject}
                      >
                        {r.subject}
                      </p>
                      {!r.seen && <span className="ui-chip ui-chip-warn">Unread</span>}
                      {r.hasAttachments && (
                        <span className="ui-chip">File</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]" title={from}>
                      {from}
                      {r.date ? ` · ${new Date(r.date).toLocaleString()}` : ""}
                    </p>
                    {r.preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--color-ink-muted)]">
                        {r.preview}
                      </p>
                    ) : null}
                  </button>
                </div>
                <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setViewUid(r.uid)}
                    className="ui-btn ui-btn-primary w-full sm:w-auto"
                  >
                    Open
                  </button>
                </div>
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

      {viewUid !== null && (
        <InboxMessageModal
          uid={viewUid}
          onClose={() => setViewUid(null)}
          onChanged={() => void load()}
          onUseAsNew={onUseAsNew}
        />
      )}
    </>
  );
}
