"use client";

import { useCallback, useEffect, useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import { useWaSendProgress } from "@/components/whatsapp/WaSendProgressProvider";

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
  failures?: { phone: string; errorMessage: string }[];
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
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [bodyVariable, setBodyVariable] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNote, setEditNote] = useState<string | null>(null);
  const { retry } = useWaSendProgress();

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

  async function openEdit(row: BroadcastRow) {
    setError(null);
    setEditNote(null);
    if (editId === row.id) {
      setEditId(null);
      return;
    }
    setEditId(row.id);
    setEditMessage(row.message);
    try {
      const res = await fetch("/api/whatsapp/connection");
      const data = await res.json();
      const connection = data.connection as {
        phoneNumberId?: string;
        templateName?: string;
        templateLanguage?: string;
        bodyVariable?: boolean;
      } | null;
      setPhoneNumberId(connection?.phoneNumberId ?? "");
      setTemplateName(connection?.templateName ?? "");
      setTemplateLanguage(connection?.templateLanguage ?? "en_US");
      setBodyVariable(connection?.bodyVariable === true);
    } catch {
      setError("Could not load the template settings.");
    }
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    setError(null);
    setEditNote(null);
    try {
      const messageRes = await fetch(`/api/whatsapp/broadcasts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: editMessage }),
      });
      const messageData = await messageRes.json();
      if (!messageRes.ok) {
        setError(messageData.error ?? "Could not save the message.");
        return;
      }
      if (phoneNumberId) {
        const connectionRes = await fetch("/api/whatsapp/connection", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumberId,
            templateName,
            templateLanguage,
            bodyVariable,
            accessToken: "",
          }),
        });
        const connectionData = await connectionRes.json();
        if (!connectionRes.ok) {
          setError(connectionData.error ?? "Could not save the template.");
          return;
        }
      }
      setEditNote("Saved. Press Retry to send the failed numbers again.");
      setEditId(null);
      void load(pagination.page, pagination.pageSize, appliedQuery);
    } catch {
      setError("Could not save the edit.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function retryRow(id: string) {
    setRetryingId(id);
    setError(null);
    const result = await retry(id);
    setRetryingId(null);
    if (!result.ok) setError(result.error);
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
      {editNote && <p className="px-4 py-3 text-sm text-[var(--color-ok)]">{editNote}</p>}
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
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]" suppressHydrationWarning>
                  {new Date(row.createdAt).toLocaleString()} · {row.sent} sent · {row.pending} pending ·{" "}
                  {row.failed} failed
                  {row.attachmentName ? ` · ${row.attachmentName}` : ""}
                </p>
                {(row.failures?.length ?? 0) > 0 && (
                  <div className="mt-2 rounded-lg border border-[#fecdca] bg-[#fff5f4] px-3 py-2 text-xs text-[var(--color-danger)]">
                    <p className="font-semibold">Failure log</p>
                    <ul className="mt-1 space-y-1">
                      {row.failures?.map((failure) => (
                        <li key={`${failure.phone}-${failure.errorMessage}`}>
                          <span className="font-mono">{failure.phone}</span>
                          {" — "}
                          {failure.errorMessage}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                {row.status === "COMPLETED" && (
                  <button type="button" className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => void openEdit(row)}>
                    {editId === row.id ? "Close" : "Edit"}
                  </button>
                )}
                {row.failed > 0 && row.status === "COMPLETED" && (
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary !px-2.5 !py-1 text-xs"
                    disabled={retryingId === row.id}
                    onClick={() => void retryRow(row.id)}
                  >
                    {retryingId === row.id ? "Retrying…" : "Retry"}
                  </button>
                )}
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
            {editId === row.id && (
              <form
                className="mt-3 grid gap-3 rounded-xl border border-[var(--color-line)] bg-[#f4faf7] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit(row.id);
                }}
              >
                <label className="text-xs font-semibold text-[var(--color-ink)]">
                  Alert text
                  <textarea
                    value={editMessage}
                    onChange={(event) => setEditMessage(event.target.value)}
                    rows={3}
                    className="app-input mt-1"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-[var(--color-ink)]">
                    Template name
                    <input
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      className="app-input mt-1 font-mono"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[var(--color-ink)]">
                    Template language
                    <input
                      value={templateLanguage}
                      onChange={(event) => setTemplateLanguage(event.target.value)}
                      className="app-input mt-1 font-mono"
                    />
                  </label>
                </div>
                <label className="flex items-start gap-2 text-xs text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={bodyVariable}
                    onChange={(event) => setBodyVariable(event.target.checked)}
                  />
                  <span>Insert the alert text as {"{{1}}"}. Leave this off for hello_world.</span>
                </label>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Meta’s test template is named hello_world and its language is en_US. It has no {"{{1}}"}
                  variable.
                </p>
                <div className="flex gap-2">
                  <button type="submit" className="ui-btn ui-btn-primary !px-3 !py-1.5 text-xs" disabled={savingEdit}>
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
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
