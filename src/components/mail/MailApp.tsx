"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import {
  emptySearchForm,
  filtersToQueryParams,
  MailSearchPanel,
  type SearchFormState,
} from "@/components/mail/MailSearchPanel";
import type { MailAction, MailFolderId, MailListItem, MailSort } from "@/lib/mail/types";

const RichTextEditor = dynamic(
  () => import("@/components/RichTextEditor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-[180px] animate-pulse rounded-xl bg-[#eef2f6]" />,
  },
);

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type FullMessage = MailListItem & {
  html: string;
  text: string;
  cc?: string;
  attachments: { filename: string; contentType: string; size: number }[];
};

const FOLDERS: { id: MailFolderId; label: string; group: "main" | "labels" }[] = [
  { id: "inbox", label: "Inbox", group: "main" },
  { id: "starred", label: "Starred", group: "main" },
  { id: "snoozed", label: "Snoozed", group: "main" },
  { id: "important", label: "Important", group: "main" },
  { id: "sent", label: "Sent", group: "main" },
  { id: "scheduled", label: "Scheduled", group: "main" },
  { id: "drafts", label: "Drafts", group: "main" },
  { id: "all", label: "All Mail", group: "main" },
  { id: "spam", label: "Spam", group: "main" },
  { id: "trash", label: "Trash", group: "main" },
  { id: "social", label: "Social", group: "labels" },
  { id: "updates", label: "Updates", group: "labels" },
  { id: "forums", label: "Forums", group: "labels" },
  { id: "promotions", label: "Promotions", group: "labels" },
];

function parseId(item: MailListItem) {
  if (item.source === "local") {
    return { source: "local" as const, localId: item.localId!, mailbox: undefined, uid: undefined };
  }
  return {
    source: "imap" as const,
    mailbox: item.mailbox!,
    uid: item.uid!,
    localId: undefined,
  };
}

export function MailApp() {
  const [folder, setFolder] = useState<MailFolderId>("inbox");
  const [rows, setRows] = useState<MailListItem[] | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [accountEmail, setAccountEmail] = useState("");
  const [searchForm, setSearchForm] = useState<SearchFormState>(emptySearchForm);
  const [appliedSearch, setAppliedSearch] = useState<SearchFormState>(emptySearchForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [sort, setSort] = useState<MailSort>("date_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<MailListItem | null>(null);
  const [message, setMessage] = useState<FullMessage | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "forward" | "draft" | "scheduled">(
    "new",
  );
  const [draftId, setDraftId] = useState<string | null>(null);
  const [scheduledId, setScheduledId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [sendAt, setSendAt] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  const listAbort = useRef<AbortController | null>(null);
  const listSeq = useRef(0);

  const load = useCallback(
    async (page = pagination.page, pageSize = pagination.pageSize, search = appliedSearch) => {
      listAbort.current?.abort();
      const controller = new AbortController();
      listAbort.current = controller;
      const seq = ++listSeq.current;
      setLoadingList(true);
      setError(null);
      try {
        const params = filtersToQueryParams(search);
        params.set("folder", folder);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        params.set("sort", sort);
        const res = await fetch(`/api/mail?${params}`, { signal: controller.signal });
        if (seq !== listSeq.current) return;
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not load mail");
          setRows([]);
          return;
        }
        setRows(data.messages as MailListItem[]);
        setAccountEmail(data.accountEmail || "");
        setPagination(data.pagination as Pagination);
        setSearchSummary(data.searchSummary ?? null);
        setSelected(new Set());
      } catch (err: unknown) {
        if (seq !== listSeq.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Network error while loading mail");
        setRows([]);
      } finally {
        if (seq === listSeq.current) setLoadingList(false);
      }
    },
    [folder, pagination.page, pagination.pageSize, sort, appliedSearch],
  );

  useEffect(() => {
    // Deep-link: /as-new?q=...&from=... etc.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].some((k) => ["q", "from", "to", "subject", "since", "before", "scope", "unread", "starred", "hasAttachment"].includes(k))) {
      return;
    }
    const next: SearchFormState = {
      ...emptySearchForm(),
      q: params.get("q") || "",
      from: params.get("from") || "",
      to: params.get("to") || "",
      subject: params.get("subject") || "",
      since: params.get("since") || "",
      before: params.get("before") || "",
      hasAttachment: params.get("hasAttachment") === "1",
      unreadOnly: params.get("unread") === "1",
      starredOnly: params.get("starred") === "1",
      scope: params.get("scope") === "all_folders" ? "all_folders" : "folder",
    };
    setSearchForm(next);
    setAppliedSearch(next);
    if (next.from || next.to || next.subject || next.since || next.before || next.hasAttachment || next.scope === "all_folders") {
      setAdvancedOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load(1, pagination.pageSize, appliedSearch);
    return () => {
      listAbort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, sort, appliedSearch]);

  function applySearch() {
    setAppliedSearch({ ...searchForm });
    if (typeof window !== "undefined") {
      const params = filtersToQueryParams(searchForm);
      params.set("folder", folder);
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/as-new?${qs}` : "/as-new");
    }
  }

  function clearSearch() {
    const empty = emptySearchForm();
    setSearchForm(empty);
    setAppliedSearch(empty);
    setSearchSummary(null);
  }

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

  function toggleAll() {
    if (!rows) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function openMessage(item: MailListItem) {
    setActive(item);
    setMessage(null);
    setLoadingMsg(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (item.source === "local") {
        params.set("source", "local");
        const localFolder =
          item.folderHint === "scheduled" || item.folderHint === "snoozed" || item.folderHint === "drafts"
            ? item.folderHint
            : folder === "scheduled"
              ? "scheduled"
              : folder === "snoozed"
                ? "snoozed"
                : "drafts";
        params.set("folder", localFolder);
        params.set("id", item.localId || "");
      } else {
        params.set("source", "imap");
        params.set("mailbox", item.mailbox || "");
        params.set("uid", String(item.uid));
      }
      const res = await fetch(`/api/mail/message?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open message");
        return;
      }
      setMessage(data.message as FullMessage);
      setRows((prev) =>
        prev
          ? prev.map((r) => (r.id === item.id ? { ...r, seen: true } : r))
          : prev,
      );
    } catch {
      setError("Network error while opening message");
    } finally {
      setLoadingMsg(false);
    }
  }

  async function runAction(
    action: MailAction,
    items: MailListItem[],
    extra?: { snoozeUntil?: string },
  ) {
    if (items.length === 0) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/mail/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          folder,
          snoozeUntil: extra?.snoozeUntil,
          targets: items.map(parseId),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      if (data.errors?.length) setError(data.errors.join("; "));
      setNotice(`${action} · ${data.ok} updated`);
      if (active && items.some((i) => i.id === active.id)) {
        if (action === "trash" || action === "delete" || action === "archive" || action === "spam") {
          setActive(null);
          setMessage(null);
        }
      }
      await load();
    } catch {
      setError("Network error while updating mail");
    } finally {
      setBusy(false);
    }
  }

  function openCompose(
    mode: typeof composeMode,
    seed?: Partial<{ to: string; cc: string; subject: string; bodyHtml: string; draftId: string; scheduledId: string; sendAt: string }>,
  ) {
    setComposeMode(mode);
    setTo(seed?.to || "");
    setCc(seed?.cc || "");
    setSubject(seed?.subject || "");
    setBodyHtml(seed?.bodyHtml || "<p></p>");
    setDraftId(seed?.draftId || null);
    setScheduledId(seed?.scheduledId || null);
    setSendAt(seed?.sendAt || "");
    setEditorKey((k) => k + 1);
    setComposeOpen(true);
  }

  function replyTo() {
    if (!message) return;
    openCompose("reply", {
      to: message.fromEmail,
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      bodyHtml: `<p></p><hr/><p><em>On ${message.date ? new Date(message.date).toLocaleString() : ""}, ${message.fromEmail} wrote:</em></p>${message.html}`,
    });
  }

  function forwardMsg() {
    if (!message) return;
    openCompose("forward", {
      subject: /^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
      bodyHtml: `<p></p><hr/><p><em>Forwarded message</em></p>${message.html}`,
    });
  }

  async function submitCompose(mode: "send" | "draft" | "schedule" | "reschedule") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          to,
          cc,
          subject,
          bodyHtml,
          sendAt: sendAt || undefined,
          draftId,
          scheduledId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Compose failed");
        return;
      }
      setComposeOpen(false);
      setNotice(
        mode === "draft"
          ? "Draft saved"
          : mode === "schedule" || mode === "reschedule"
            ? "Scheduled"
            : "Sent",
      );
      if (mode === "draft") setFolder("drafts");
      if (mode === "schedule" || mode === "reschedule") setFolder("scheduled");
      await load(1, pagination.pageSize);
    } catch {
      setError("Network error while composing");
    } finally {
      setBusy(false);
    }
  }

  const selectedItems = useMemo(
    () => (rows ?? []).filter((r) => selected.has(r.id)),
    [rows, selected],
  );

  function snoozeSelected() {
    const hours = window.prompt("Snooze for how many hours?", "3");
    if (!hours) return;
    const n = Number(hours);
    if (!Number.isFinite(n) || n <= 0) return;
    const until = new Date(Date.now() + n * 3600_000).toISOString();
    void runAction("snooze", selectedItems.length ? selectedItems : active ? [active] : [], {
      snoozeUntil: until,
    });
  }

  return (
    <div className="mail-shell">
      <aside className={`mail-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="mail-sidebar-head">
          <button
            type="button"
            className="ui-btn ui-btn-primary w-full"
            onClick={() => openCompose("new")}
          >
            Compose
          </button>
        </div>
        <nav className="mail-nav">
          <p className="mail-nav-label">Folders</p>
          {FOLDERS.filter((f) => f.group === "main").map((f) => (
            <button
              key={f.id}
              type="button"
              className={`mail-nav-item ${folder === f.id ? "is-active" : ""}`}
              onClick={() => {
                setFolder(f.id);
                setActive(null);
                setMessage(null);
                setSidebarOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
          <p className="mail-nav-label">Categories</p>
          {FOLDERS.filter((f) => f.group === "labels").map((f) => (
            <button
              key={f.id}
              type="button"
              className={`mail-nav-item ${folder === f.id ? "is-active" : ""}`}
              onClick={() => {
                setFolder(f.id);
                setActive(null);
                setMessage(null);
                setSidebarOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
        </nav>
        {accountEmail ? (
          <p className="mail-account" title={accountEmail}>
            {accountEmail}
          </p>
        ) : null}
      </aside>

      <section className="mail-main">
        <header className="mail-toolbar">
          <button
            type="button"
            className="ui-btn ui-btn-ghost mail-menu-btn"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            Menu
          </button>
          <div className="mail-toolbar-search">
            <MailSearchPanel
              form={searchForm}
              open={advancedOpen}
              folderLabel={FOLDERS.find((f) => f.id === folder)?.label || folder}
              searching={loadingList}
              resultCount={searchSummary ? pagination.total : null}
              searchSummary={searchSummary}
              onChange={setSearchForm}
              onToggleOpen={() => setAdvancedOpen((v) => !v)}
              onSubmit={applySearch}
              onClear={clearSearch}
            />
          </div>
          <select
            className="mail-select"
            value={sort}
            onChange={(e) => setSort(e.target.value as MailSort)}
          >
            <option value="date_desc">Newest</option>
            <option value="date_asc">Oldest</option>
            <option value="from_asc">From A–Z</option>
            <option value="subject_asc">Subject A–Z</option>
          </select>
          <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || loadingList} onClick={() => void load()}>
            Refresh
          </button>
        </header>

        {(error || notice) && (
          <div className="mail-alerts">
            {error && (
              <div className="ui-alert ui-alert-error flex items-center justify-between gap-3">
                <span>{error}</span>
                <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            )}
            {notice && <div className="ui-alert ui-alert-ok">{notice}</div>}
          </div>
        )}

        <div className="mail-actions-bar">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!rows?.length} />
            Select
          </label>
          <div className="mail-action-btns">
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={() => void runAction("star", selectedItems)}>Star</button>
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={() => void runAction("important", selectedItems)}>Important</button>
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={() => void runAction("archive", selectedItems)}>Archive</button>
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={snoozeSelected}>Snooze</button>
            <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={() => void runAction("spam", selectedItems)}>Spam</button>
            <button type="button" className="ui-btn ui-btn-danger" disabled={busy || selectedItems.length === 0} onClick={() => void runAction(folder === "trash" ? "delete" : "trash", selectedItems)}>
              {folder === "trash" ? "Delete forever" : "Delete"}
            </button>
            {(folder === "trash" || folder === "spam") && (
              <button type="button" className="ui-btn ui-btn-ghost" disabled={busy || selectedItems.length === 0} onClick={() => void runAction("restore", selectedItems)}>
                Restore
              </button>
            )}
          </div>
        </div>

        <div className="mail-panes">
          <div className={`mail-list ${active ? "has-active" : ""}`}>
            {loadingList && !rows ? (
              <div className="p-6 space-y-3">
                <div className="h-14 animate-pulse rounded-xl bg-[#eef2f6]" />
                <div className="h-14 animate-pulse rounded-xl bg-[#eef2f6]" />
              </div>
            ) : rows && rows.length === 0 ? (
              <div className="mail-empty">
                <p className="font-display font-semibold">No messages</p>
                <p className="text-sm text-[var(--color-ink-muted)]">This folder is empty.</p>
              </div>
            ) : (
              <ul>
                {(rows ?? []).map((r) => {
                  const from =
                    r.fromName && r.fromEmail
                      ? `${r.fromName}`
                      : r.fromEmail || r.fromName || "Unknown";
                  return (
                    <li key={r.id}>
                      <div
                        className={`mail-row ${active?.id === r.id ? "is-active" : ""} ${r.seen ? "" : "is-unread"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Select ${r.subject}`}
                        />
                        <button
                          type="button"
                          className="mail-star"
                          title={r.starred ? "Unstar" : "Star"}
                          onClick={() => void runAction(r.starred ? "unstar" : "star", [r])}
                        >
                          {r.starred ? "★" : "☆"}
                        </button>
                        <button type="button" className="mail-row-main" onClick={() => void openMessage(r)}>
                          <div className="mail-row-top">
                            <span className="mail-from">{from}</span>
                            <span className="mail-date">
                              {r.date ? new Date(r.date).toLocaleString() : ""}
                            </span>
                          </div>
                          <p className="mail-subject">
                            {r.important ? <span className="mail-important">!</span> : null}
                            {r.subject}
                            {r.hasAttachments ? <span className="mail-file">File</span> : null}
                          </p>
                          {r.preview ? <p className="mail-preview">{r.preview}</p> : null}
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
              disabled={busy || loadingList}
              onPageChange={(page) => void load(page, pagination.pageSize)}
              onPageSizeChange={(pageSize) => void load(1, pageSize)}
            />
          </div>

          <div className={`mail-reader ${active ? "is-open" : ""}`}>
            {!active ? (
              <div className="mail-empty">
                <p className="font-display font-semibold">Select a message</p>
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Open any email to read, reply, forward, or manage it.
                </p>
              </div>
            ) : loadingMsg || !message ? (
              <div className="p-6 space-y-3">
                <div className="h-6 w-2/3 animate-pulse rounded bg-[#eef2f6]" />
                <div className="h-40 animate-pulse rounded-xl bg-[#eef2f6]" />
              </div>
            ) : (
              <div className="mail-reader-inner">
                <div className="mail-reader-head">
                  <button type="button" className="ui-btn ui-btn-ghost md:hidden" onClick={() => { setActive(null); setMessage(null); }}>
                    Back
                  </button>
                  <h2 className="mail-reader-subject">{message.subject}</h2>
                  <div className="mail-reader-actions">
                    {folder === "drafts" && (
                      <button type="button" className="ui-btn ui-btn-primary" onClick={() => openCompose("draft", {
                        to: message.to,
                        cc: message.cc,
                        subject: message.subject,
                        bodyHtml: message.html,
                        draftId: message.localId,
                      })}>
                        Edit draft
                      </button>
                    )}
                    {folder === "scheduled" && (
                      <button type="button" className="ui-btn ui-btn-primary" onClick={() => openCompose("scheduled", {
                        to: message.to,
                        cc: message.cc,
                        subject: message.subject,
                        bodyHtml: message.html,
                        scheduledId: message.localId,
                        sendAt: message.date ? new Date(message.date).toISOString().slice(0, 16) : "",
                      })}>
                        Reschedule
                      </button>
                    )}
                    {message.source === "imap" && (
                      <>
                        <button type="button" className="ui-btn ui-btn-ghost" onClick={replyTo}>Reply</button>
                        <button type="button" className="ui-btn ui-btn-ghost" onClick={forwardMsg}>Forward</button>
                        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void runAction(message.starred ? "unstar" : "star", [active])}>
                          {message.starred ? "Unstar" : "Star"}
                        </button>
                        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => void runAction("archive", [active])}>Archive</button>
                        <button type="button" className="ui-btn ui-btn-ghost" onClick={snoozeSelected}>Snooze</button>
                        <button type="button" className="ui-btn ui-btn-danger" onClick={() => void runAction(folder === "trash" ? "delete" : "trash", [active])}>
                          {folder === "trash" ? "Delete forever" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mail-meta">
                  <p><strong>From</strong> {message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}</p>
                  <p><strong>To</strong> {message.to || "—"}</p>
                  {message.cc ? <p><strong>Cc</strong> {message.cc}</p> : null}
                  <p><strong>Date</strong> {message.date ? new Date(message.date).toLocaleString() : "—"}</p>
                </div>
                {message.attachments?.length > 0 && (
                  <ul className="mail-attach">
                    {message.attachments.map((a, i) => (
                      <li key={`${a.filename}-${i}`}>
                        {a.filename} · {Math.max(1, Math.round(a.size / 1024))} KB
                      </li>
                    ))}
                  </ul>
                )}
                <div
                  className="mail-body campaign-html-preview"
                  dangerouslySetInnerHTML={{ __html: message.html }}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {composeOpen && (
        <div className="mail-compose-backdrop" role="dialog" aria-modal="true">
          <div className="mail-compose">
            <div className="mail-compose-head">
              <h3 className="font-display font-semibold">
                {composeMode === "reply"
                  ? "Reply"
                  : composeMode === "forward"
                    ? "Forward"
                    : composeMode === "draft"
                      ? "Edit draft"
                      : composeMode === "scheduled"
                        ? "Edit scheduled"
                        : "New message"}
              </h3>
              <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setComposeOpen(false)}>
                Close
              </button>
            </div>
            <div className="mail-compose-fields">
              <input className="app-input" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} />
              <input className="app-input" placeholder="Cc" value={cc} onChange={(e) => setCc(e.target.value)} />
              <input className="app-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <RichTextEditor key={editorKey} value={bodyHtml} onChange={setBodyHtml} bootKey={editorKey} />
              <label className="block text-xs text-[var(--color-ink-muted)]">
                Schedule send (optional)
                <input
                  type="datetime-local"
                  className="app-input mt-1"
                  value={sendAt}
                  onChange={(e) => setSendAt(e.target.value)}
                />
              </label>
            </div>
            <div className="mail-compose-foot">
              <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => void submitCompose("draft")}>
                Save draft
              </button>
              {scheduledId ? (
                <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !sendAt} onClick={() => void submitCompose("reschedule")}>
                  Update schedule
                </button>
              ) : sendAt ? (
                <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => void submitCompose("schedule")}>
                  Schedule
                </button>
              ) : (
                <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => void submitCompose("send")}>
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
