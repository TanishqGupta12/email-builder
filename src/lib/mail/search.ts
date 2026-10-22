import type { MailListItem, MailSearchFilters } from "@/lib/mail/types";

export type { MailSearchFilters };

const EMPTY: MailSearchFilters = {};

/** Parse Gmail-style operators from a quick query string. */
export function parseQuickQuery(raw: string): MailSearchFilters {
  const filters: MailSearchFilters = {};
  let rest = raw.trim();
  if (!rest) return filters;

  const take = (re: RegExp, key: keyof MailSearchFilters) => {
    rest = rest.replace(re, (_, value: string) => {
      const cleaned = value.replace(/^"|"$/g, "").trim();
      if (cleaned) (filters as Record<string, unknown>)[key] = cleaned;
      return " ";
    });
  };

  take(/\bfrom:("([^"]+)"|(\S+))/gi, "from");
  take(/\bto:("([^"]+)"|(\S+))/gi, "to");
  take(/\bsubject:("([^"]+)"|(\S+))/gi, "subject");
  take(/\bafter:(\d{4}-\d{2}-\d{2})/gi, "since");
  take(/\bbefore:(\d{4}-\d{2}-\d{2})/gi, "before");
  take(/\bsince:(\d{4}-\d{2}-\d{2})/gi, "since");

  if (/\bis:unread\b/i.test(rest)) {
    filters.unreadOnly = true;
    rest = rest.replace(/\bis:unread\b/gi, " ");
  }
  if (/\bis:read\b/i.test(rest)) {
    filters.unreadOnly = false;
    rest = rest.replace(/\bis:read\b/gi, " ");
  }
  if (/\bis:starred\b/i.test(rest)) {
    filters.starredOnly = true;
    rest = rest.replace(/\bis:starred\b/gi, " ");
  }
  if (/\bhas:attachment\b/i.test(rest)) {
    filters.hasAttachment = true;
    rest = rest.replace(/\bhas:attachment\b/gi, " ");
  }

  const keywords = rest.replace(/\s+/g, " ").trim();
  if (keywords) filters.q = keywords;
  return filters;
}

export function mergeSearchFilters(
  base: MailSearchFilters,
  overlay: MailSearchFilters,
): MailSearchFilters {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overlay).filter(([, v]) => v !== undefined && v !== "" && v !== null),
    ),
  };
}

export function hasActiveSearch(filters: MailSearchFilters): boolean {
  return Boolean(
    filters.q?.trim() ||
      filters.from?.trim() ||
      filters.to?.trim() ||
      filters.subject?.trim() ||
      filters.since ||
      filters.before ||
      filters.hasAttachment ||
      filters.unreadOnly ||
      filters.starredOnly ||
      filters.scope === "all_folders",
  );
}

function parseDateBound(value?: string, endOfDay = false): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

/** Build an IMAP SearchObject from advanced filters. */
export function buildImapSearchQuery(
  filters: MailSearchFilters,
  base?: Record<string, unknown>,
): Record<string, unknown> {
  const query: Record<string, unknown> = { ...(base ?? {}) };

  if (filters.unreadOnly) query.seen = false;
  if (filters.starredOnly) query.flagged = true;
  if (filters.from?.trim()) query.from = filters.from.trim();
  if (filters.to?.trim()) query.to = filters.to.trim();
  if (filters.subject?.trim()) query.subject = filters.subject.trim();

  const since = parseDateBound(filters.since);
  const before = parseDateBound(filters.before, true);
  if (since) query.since = since;
  if (before) query.before = before;

  const keywords = filters.q?.trim();
  if (keywords) {
    // Top-level IMAP keys are ANDed; `or` matches keywords in common fields.
    query.or = [
      { subject: keywords },
      { from: keywords },
      { to: keywords },
      { body: keywords },
      { text: keywords },
    ];
  }

  if (filters.hasAttachment) {
    const existing = typeof query.gmraw === "string" ? query.gmraw : "";
    query.gmraw = `${existing} has:attachment`.trim();
  }

  return query;
}

/** Fallback search when complex OR/body queries fail. */
export function buildImapSearchFallback(
  filters: MailSearchFilters,
  base?: Record<string, unknown>,
): Record<string, unknown> {
  const query: Record<string, unknown> = { ...(base ?? {}) };
  if (filters.unreadOnly) query.seen = false;
  if (filters.starredOnly) query.flagged = true;
  if (filters.from?.trim()) query.from = filters.from.trim();
  if (filters.to?.trim()) query.to = filters.to.trim();
  if (filters.subject?.trim()) query.subject = filters.subject.trim();
  else if (filters.q?.trim()) query.subject = filters.q.trim();
  const since = parseDateBound(filters.since);
  const before = parseDateBound(filters.before, true);
  if (since) query.since = since;
  if (before) query.before = before;
  return query;
}

export function filterLocalMailItems(
  items: MailListItem[],
  filters: MailSearchFilters,
): MailListItem[] {
  if (!hasActiveSearch(filters) && !filters.unreadOnly && !filters.starredOnly) {
    // still allow empty filters = all
  }

  const q = filters.q?.trim().toLowerCase();
  const from = filters.from?.trim().toLowerCase();
  const to = filters.to?.trim().toLowerCase();
  const subject = filters.subject?.trim().toLowerCase();
  const since = parseDateBound(filters.since)?.getTime();
  const before = parseDateBound(filters.before, true)?.getTime();

  return items.filter((item) => {
    if (filters.unreadOnly && item.seen) return false;
    if (filters.starredOnly && !item.starred) return false;
    if (filters.hasAttachment && !item.hasAttachments) return false;

    if (from) {
      const hay = `${item.fromEmail} ${item.fromName}`.toLowerCase();
      if (!hay.includes(from)) return false;
    }
    if (to) {
      if (!item.to.toLowerCase().includes(to)) return false;
    }
    if (subject) {
      if (!item.subject.toLowerCase().includes(subject)) return false;
    }
    if (q) {
      const hay = `${item.subject} ${item.fromEmail} ${item.fromName} ${item.to} ${item.preview}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (since != null || before != null) {
      const t = item.date ? Date.parse(item.date) : NaN;
      if (!Number.isFinite(t)) return false;
      if (since != null && t < since) return false;
      if (before != null && t > before) return false;
    }
    return true;
  });
}

export function filtersFromRequest(params: URLSearchParams): MailSearchFilters {
  const quick = params.get("q")?.trim() || "";
  const parsed = quick ? parseQuickQuery(quick) : { ...EMPTY };

  const overlay: MailSearchFilters = {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    subject: params.get("subject") || undefined,
    since: params.get("since") || undefined,
    before: params.get("before") || undefined,
    hasAttachment: params.get("hasAttachment") === "1" ? true : undefined,
    unreadOnly: params.get("unread") === "1" ? true : parsed.unreadOnly,
    starredOnly: params.get("starred") === "1" ? true : parsed.starredOnly,
    scope: params.get("scope") === "all_folders" ? "all_folders" : "folder",
  };

  // Explicit advanced fields override parsed operators when provided.
  return mergeSearchFilters(parsed, overlay);
}

export function describeSearch(filters: MailSearchFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(`“${filters.q}”`);
  if (filters.from) parts.push(`from:${filters.from}`);
  if (filters.to) parts.push(`to:${filters.to}`);
  if (filters.subject) parts.push(`subject:${filters.subject}`);
  if (filters.since) parts.push(`after:${filters.since}`);
  if (filters.before) parts.push(`before:${filters.before}`);
  if (filters.hasAttachment) parts.push("has:attachment");
  if (filters.unreadOnly) parts.push("is:unread");
  if (filters.starredOnly) parts.push("is:starred");
  if (filters.scope === "all_folders") parts.push("all folders");
  return parts.join(" · ");
}
