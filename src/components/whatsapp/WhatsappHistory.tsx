"use client";

import { useCallback, useEffect, useState } from "react";
import { ListPagination } from "@/components/ListPagination";

type BroadcastRow = {
  id: string;
  message: string;
  delayMs: number;
  status: string;
  createdAt: string;
  attachmentName: string | null;
  sent: number;
  failed: number;
  pending: number;
};

type RecipientRow = {
  id: string;
  phone: string;
  status: string;
  errorMessage: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function WhatsappHistory() {
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async (page: number, pageSize: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q) params.set("q", q);
      const res = await fetch(`/api/whatsapp/broadcasts?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load history.");
        return;
      }
      setRows(data.broadcasts ?? []);
      setPagination(data.pagination);
    } catch {
      setError("Could not load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(pagination.page, pagination.pageSize, appliedQuery);
  }, [appliedQuery, load, pagination.page, pagination.pageSize]);

  useEffect(() => {
    const onRefresh = () => {
      void load(pagination.page, pagination.pageSize, appliedQuery);
    };
    window.addEventListener("whatsapp:refresh", onRefresh);
    return () => window.removeEventListener("whatsapp:refresh", onRefresh);
  }, [appliedQuery, load, pagination.page, pagination.pageSize]);

  async function openRow(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetailLoading(true);
    setRecipients([]);
    try {
      const res = await fetch(`/api/whatsapp/broadcasts/${id}`);
      const data = await res.json();
      if (res.ok) setRecipients(data.broadcast?.recipients ?? []);
    } finally {
      setDetailLoading(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/whatsapp/broadcasts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not delete that broadcast.");
      return;
    }
    setPendingDelete(null);
    if (openId === id) setOpenId(null);
    void load(pagination.page, pagination.pageSize, appliedQuery);
  }

  return (
    <div>
      <form
        className="flex flex-col gap-2 border-b border-[var(--color-line)] p-4 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setPagination((current) => ({ ...current, page: 1 }));
          setAppliedQuery(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search message or number"
          className="app-input sm:max-w-sm"
        />
        <button type="submit" className="ui-btn ui-btn-primary">
          Search
        </button>
      </form>

      {error && <p className="px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>}
      {loading && rows.length === 0 && (
        <p className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">Loading broadcasts…</p>
      )}
      {!loading && rows.length === 0 && (
        <p className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">No WhatsApp broadcasts yet.</p>
      )}

      <ul className="divide-y divide-[var(--color-line)]">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-[var(--color-ink)]">{row.message}</p>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  {new Date(row.createdAt).toLocaleString()} · {row.sent} sent · {row.pending} pending ·{" "}
                  {row.failed} failed
                  {row.attachmentName ? ` · ${row.attachmentName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`ui-chip ${
                    row.status === "COMPLETED"
                      ? row.failed > 0
                        ? "ui-chip-warn"
                        : "ui-chip-ok"
                      : "ui-chip-warn"
                  }`}
                >
                  {row.status}
                </span>
                <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => void openRow(row.id)}>
                  {openId === row.id ? "Hide" : "Numbers"}
                </button>
                {pendingDelete === row.id ? (
                  <>
                    <button type="button" className="ui-btn ui-btn-danger !px-2.5 !py-1 text-xs" onClick={() => void remove(row.id)}>
                      Confirm
                    </button>
                    <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setPendingDelete(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setPendingDelete(row.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            {openId === row.id && (
              <div className="mt-3 rounded-xl bg-[#f4faf7] px-3 py-2">
                {detailLoading && <p className="text-xs text-[var(--color-ink-muted)]">Loading numbers…</p>}
                {!detailLoading && recipients.length === 0 && (
                  <p className="text-xs text-[var(--color-ink-muted)]">No numbers stored.</p>
                )}
                <ul className="max-h-56 space-y-1 overflow-auto">
                  {recipients.map((recipient) => (
                    <li key={recipient.id} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-mono text-[var(--color-ink)]">{recipient.phone}</span>
                      <span className="text-right text-[var(--color-ink-muted)]">
                        {recipient.status}
                        {recipient.errorMessage ? ` · ${recipient.errorMessage}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      <ListPagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        totalPages={pagination.totalPages}
        disabled={loading}
        onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => setPagination((current) => ({ ...current, page: 1, pageSize }))}
      />
    </div>
  );
}
