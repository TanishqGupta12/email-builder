"use client";

import type { MailFolderId, MailSearchFilters } from "@/lib/mail/types";

export type SearchFormState = {
  q: string;
  from: string;
  to: string;
  subject: string;
  since: string;
  before: string;
  hasAttachment: boolean;
  unreadOnly: boolean;
  starredOnly: boolean;
  scope: "folder" | "all_folders";
};

export const emptySearchForm = (): SearchFormState => ({
  q: "",
  from: "",
  to: "",
  subject: "",
  since: "",
  before: "",
  hasAttachment: false,
  unreadOnly: false,
  starredOnly: false,
  scope: "folder",
});

export function formToFilters(form: SearchFormState): MailSearchFilters {
  return {
    q: form.q.trim() || undefined,
    from: form.from.trim() || undefined,
    to: form.to.trim() || undefined,
    subject: form.subject.trim() || undefined,
    since: form.since || undefined,
    before: form.before || undefined,
    hasAttachment: form.hasAttachment || undefined,
    unreadOnly: form.unreadOnly || undefined,
    starredOnly: form.starredOnly || undefined,
    scope: form.scope,
  };
}

export function filtersToQueryParams(form: SearchFormState): URLSearchParams {
  const params = new URLSearchParams();
  if (form.q.trim()) params.set("q", form.q.trim());
  if (form.from.trim()) params.set("from", form.from.trim());
  if (form.to.trim()) params.set("to", form.to.trim());
  if (form.subject.trim()) params.set("subject", form.subject.trim());
  if (form.since) params.set("since", form.since);
  if (form.before) params.set("before", form.before);
  if (form.hasAttachment) params.set("hasAttachment", "1");
  if (form.unreadOnly) params.set("unread", "1");
  if (form.starredOnly) params.set("starred", "1");
  if (form.scope === "all_folders") params.set("scope", "all_folders");
  return params;
}

type Props = {
  form: SearchFormState;
  open: boolean;
  folderLabel: string;
  searching?: boolean;
  resultCount?: number | null;
  searchSummary?: string | null;
  onChange: (next: SearchFormState) => void;
  onToggleOpen: () => void;
  onSubmit: () => void;
  onClear: () => void;
};

const FOLDER_HINT: Partial<Record<MailFolderId, string>> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  spam: "Spam",
  trash: "Trash",
  all: "All Mail",
};

export function MailSearchPanel({
  form,
  open,
  folderLabel,
  searching,
  resultCount,
  searchSummary,
  onChange,
  onToggleOpen,
  onSubmit,
  onClear,
}: Props) {
  return (
    <div className="mail-search-panel">
      <form
        className="mail-search-quick"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={form.q}
          onChange={(e) => onChange({ ...form, q: e.target.value })}
          placeholder='Search mail — try keywords or from:alice subject:invoice after:2026-01-01'
          className="app-input"
          aria-label="Search mail"
        />
        <button type="submit" className="ui-btn ui-btn-primary" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={onToggleOpen}>
          {open ? "Hide filters" : "Advanced"}
        </button>
      </form>

      {open && (
        <div className="mail-search-advanced">
          <div className="mail-search-grid">
            <label>
              <span>From</span>
              <input
                className="app-input"
                value={form.from}
                onChange={(e) => onChange({ ...form, from: e.target.value })}
                placeholder="sender@email.com"
              />
            </label>
            <label>
              <span>To</span>
              <input
                className="app-input"
                value={form.to}
                onChange={(e) => onChange({ ...form, to: e.target.value })}
                placeholder="recipient@email.com"
              />
            </label>
            <label>
              <span>Subject</span>
              <input
                className="app-input"
                value={form.subject}
                onChange={(e) => onChange({ ...form, subject: e.target.value })}
                placeholder="Subject contains…"
              />
            </label>
            <label>
              <span>Keywords</span>
              <input
                className="app-input"
                value={form.q}
                onChange={(e) => onChange({ ...form, q: e.target.value })}
                placeholder="Body / any text"
              />
            </label>
            <label>
              <span>After date</span>
              <input
                type="date"
                className="app-input"
                value={form.since}
                onChange={(e) => onChange({ ...form, since: e.target.value })}
              />
            </label>
            <label>
              <span>Before date</span>
              <input
                type="date"
                className="app-input"
                value={form.before}
                onChange={(e) => onChange({ ...form, before: e.target.value })}
              />
            </label>
          </div>

          <div className="mail-search-checks">
            <label>
              <input
                type="checkbox"
                checked={form.unreadOnly}
                onChange={(e) => onChange({ ...form, unreadOnly: e.target.checked })}
              />
              Unread only
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.starredOnly}
                onChange={(e) => onChange({ ...form, starredOnly: e.target.checked })}
              />
              Starred only
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.hasAttachment}
                onChange={(e) => onChange({ ...form, hasAttachment: e.target.checked })}
              />
              Has attachment
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.scope === "all_folders"}
                onChange={(e) =>
                  onChange({
                    ...form,
                    scope: e.target.checked ? "all_folders" : "folder",
                  })
                }
              />
              Search all folders
            </label>
          </div>

          <p className="mail-search-hint">
            {form.scope === "all_folders"
              ? "Searching Inbox, Sent, Spam, Trash, All Mail, Starred, plus Drafts / Scheduled / Snoozed."
              : `Searching in ${FOLDER_HINT[folderLabel as MailFolderId] || folderLabel}.`}{" "}
            Operators work in the quick box:{" "}
            <code>from:</code> <code>to:</code> <code>subject:</code> <code>after:</code>{" "}
            <code>before:</code> <code>is:unread</code> <code>has:attachment</code>
          </p>

          <div className="mail-search-actions">
            <button type="button" className="ui-btn ui-btn-ghost" onClick={onClear}>
              Clear
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={searching} onClick={onSubmit}>
              Apply filters
            </button>
          </div>
        </div>
      )}

      {searchSummary ? (
        <p className="mail-search-summary">
          Results for {searchSummary}
          {typeof resultCount === "number" ? ` · ${resultCount} found` : ""}
        </p>
      ) : null}
    </div>
  );
}
