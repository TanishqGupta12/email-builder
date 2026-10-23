import { simpleParser } from "mailparser";
import type { ImapFlow } from "imapflow";
import { getAccountEmail, withImapClient, withImapMailbox } from "@/lib/imap";
import { mailboxForFolder, resolveMailboxes } from "@/lib/mail/mailbox-map";
import {
  cancelScheduled,
  createScheduled,
  createSnooze,
  deleteDrafts,
  deleteSnoozed,
  dueScheduled,
  dueSnoozed,
  getDraft,
  getScheduled,
  listAllDrafts,
  listAllScheduled,
  listAllSnoozed,
  updateScheduled,
  upsertDraft,
} from "@/lib/mail/local-store";
import {
  buildImapSearchFallback,
  buildImapSearchQuery,
  describeSearch,
  filterLocalMailItems,
  hasActiveSearch,
} from "@/lib/mail/search";
import type {
  MailAction,
  MailComposeInput,
  MailFolderId,
  MailListItem,
  MailMessage,
  MailSearchFilters,
  MailSort,
} from "@/lib/mail/types";
import { getTransporter } from "@/lib/smtp";

function addressListToString(
  list: { address?: string | null; name?: string | null }[] | undefined,
): string {
  if (!list?.length) return "";
  return list
    .map((a) => {
      const email = a.address?.trim() || "";
      const name = a.name?.trim() || "";
      if (name && email) return `${name} <${email}>`;
      return email || name;
    })
    .filter(Boolean)
    .join(", ");
}

function firstAddress(list: { address?: string | null; name?: string | null }[] | undefined): {
  name: string;
  email: string;
} {
  const first = list?.[0];
  return { name: first?.name?.trim() || "", email: first?.address?.trim() || "" };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sortItems(items: MailListItem[], sort: MailSort): MailListItem[] {
  const copy = [...items];
  copy.sort((a, b) => {
    switch (sort) {
      case "date_asc":
        return (a.date ? Date.parse(a.date) : 0) - (b.date ? Date.parse(b.date) : 0);
      case "from_asc":
        return (a.fromEmail || a.fromName).localeCompare(b.fromEmail || b.fromName);
      case "subject_asc":
        return a.subject.localeCompare(b.subject);
      case "date_desc":
      default:
        return (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0);
    }
  });
  return copy;
}

async function processDueJobs(): Promise<void> {
  try {
    const due = await dueScheduled(10);
    for (const job of due) {
      await updateScheduled(job.id, { status: "SENDING" });
      try {
        const transporter = await getTransporter();
        await transporter.sendMail({
          from: job.accountEmail,
          to: job.toAddrs,
          cc: job.ccAddrs || undefined,
          subject: job.subject,
          html: job.bodyHtml,
        });
        await updateScheduled(job.id, { status: "SENT", errorMessage: null });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await updateScheduled(job.id, { status: "FAILED", errorMessage: message });
      }
    }
  } catch {
    /* ignore scheduler errors during list */
  }

  try {
    const woke = await dueSnoozed(20);
    for (const item of woke) {
      try {
        await withImapMailbox(item.mailbox, async (client) => {
          const boxes = await resolveMailboxes(client);
          try {
            await client.messageMove([item.uid], boxes.inbox, { uid: true });
          } catch {
            /* may already be gone */
          }
        });
      } catch {
        /* ignore */
      }
      await deleteSnoozed([item.id]);
    }
  } catch {
    /* ignore */
  }
}

function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
}

function messageToListItem(
  message: {
    uid: number;
    envelope?: {
      subject?: string | null;
      date?: Date | string | null;
      from?: { address?: string | null; name?: string | null }[];
      to?: { address?: string | null; name?: string | null }[];
    };
    flags?: Set<string>;
    bodyStructure?: { disposition?: string; childNodes?: unknown[] };
    source?: Buffer;
  },
  mailbox: string,
  preview: string,
  hasAttachments: boolean,
): MailListItem {
  const envelope = message.envelope;
  const from = firstAddress(envelope?.from);
  const flags = message.flags ?? new Set<string>();
  return {
    id: `imap:${mailbox}:${message.uid}`,
    source: "imap",
    uid: message.uid,
    mailbox,
    subject: envelope?.subject?.trim() || "(no subject)",
    fromName: from.name,
    fromEmail: from.email,
    to: addressListToString(envelope?.to),
    date: envelope?.date ? new Date(envelope.date).toISOString() : null,
    seen: flags.has("\\Seen"),
    starred: flags.has("\\Flagged"),
    important: flags.has("$Important") || flags.has("\\Important"),
    preview,
    hasAttachments,
    folderHint: mailbox,
  };
}

async function enrichFetchedMessages(
  fetched: {
    uid: number;
    envelope?: MailListItem extends never ? never : {
      subject?: string | null;
      date?: Date | string | null;
      from?: { address?: string | null; name?: string | null }[];
      to?: { address?: string | null; name?: string | null }[];
    };
    flags?: Set<string>;
    bodyStructure?: { disposition?: string; childNodes?: unknown[] };
    source?: Buffer;
  }[],
  mailbox: string,
  pageUids: number[],
): Promise<MailListItem[]> {
  const byUid = new Map(fetched.map((m) => [m.uid, m]));
  const items: MailListItem[] = [];
  for (const uid of pageUids) {
    const message = byUid.get(uid);
    if (!message) continue;
    let preview = "";
    let hasAttachments = false;
    try {
      const walk = (node?: { disposition?: string; childNodes?: unknown[] }) => {
        if (!node) return;
        if (node.disposition === "attachment") hasAttachments = true;
        if (Array.isArray(node.childNodes)) {
          for (const child of node.childNodes) walk(child as typeof node);
        }
      };
      walk(message.bodyStructure);
    } catch {
      /* ignore */
    }
    if (message.source) {
      try {
        const parsed = await simpleParser(message.source);
        const text =
          parsed.text?.trim() ||
          (typeof parsed.html === "string" ? stripHtml(parsed.html) : "") ||
          "";
        preview = text.slice(0, 160);
        if (parsed.attachments?.length) hasAttachments = true;
      } catch {
        preview = "";
      }
    }
    items.push(messageToListItem(message, mailbox, preview, hasAttachments));
  }
  return items;
}

async function searchMailboxUids(
  client: ImapFlow,
  mailbox: string,
  baseSearch: Record<string, unknown> | undefined,
  filters: MailSearchFilters,
): Promise<number[]> {
  const lock = await client.getMailboxLock(mailbox);
  try {
    const asUidList = (value: false | number[] | undefined): number[] =>
      Array.isArray(value) ? value : [];
    const mailboxExists =
      client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0;

    const primary = buildImapSearchQuery(filters, baseSearch);
    const needsSearch = Object.keys(primary).length > 0 || hasActiveSearch(filters);

    let uids: number[] = [];
    if (needsSearch) {
      try {
        uids = asUidList(await client.search(primary, { uid: true }));
      } catch {
        const fallback = buildImapSearchFallback(filters, baseSearch);
        uids = Object.keys(fallback).length
          ? asUidList(await client.search(fallback, { uid: true }))
          : [];
      }
    } else if (mailboxExists > 0) {
      uids = asUidList(await client.search({ all: true }, { uid: true }));
    }
    return [...uids].sort((a, b) => b - a);
  } finally {
    lock.release();
  }
}

const LIST_QUERY = {
  uid: true,
  flags: true,
  envelope: true,
  bodyStructure: true,
} as const;

async function fetchPageFromMailbox(
  client: ImapFlow,
  mailbox: string,
  uids: number[],
): Promise<MailListItem[]> {
  if (uids.length === 0) return [];
  const lock = await client.getMailboxLock(mailbox);
  try {
    const fetched = await client.fetchAll(uids, LIST_QUERY, { uid: true });
    return enrichFetchedMessages(fetched, mailbox, uids);
  } finally {
    lock.release();
  }
}

async function fetchSequencePage(
  client: ImapFlow,
  mailbox: string,
  page: number,
  pageSize: number,
  newestFirst: boolean,
): Promise<{ items: MailListItem[]; total: number; page: number; totalPages: number }> {
  const lock = await client.getMailboxLock(mailbox);
  try {
    const exists =
      client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists ?? 0 : 0;
    const totalPages = Math.max(1, Math.ceil(exists / pageSize) || 1);
    const currentPage = Math.min(Math.max(1, page), totalPages);
    if (exists < 1) return { items: [], total: 0, page: 1, totalPages: 1 };

    const start = newestFirst
      ? Math.max(1, exists - currentPage * pageSize + 1)
      : (currentPage - 1) * pageSize + 1;
    const end = newestFirst
      ? exists - (currentPage - 1) * pageSize
      : Math.min(exists, currentPage * pageSize);
    if (end < start) return { items: [], total: exists, page: currentPage, totalPages };

    const fetched = await client.fetchAll(`${start}:${end}`, LIST_QUERY);
    const ordered = [...fetched].sort((a, b) => (newestFirst ? b.uid - a.uid : a.uid - b.uid));
    const items = await enrichFetchedMessages(
      ordered,
      mailbox,
      ordered.map((message) => message.uid),
    );
    return { items, total: exists, page: currentPage, totalPages };
  } finally {
    lock.release();
  }
}

const CROSS_FOLDER_IDS: MailFolderId[] = [
  "inbox",
  "sent",
  "spam",
  "trash",
  "all",
  "starred",
];

const dueJobsGlobal = globalThis as typeof globalThis & { __postlineDueJobs?: boolean };

function ensureDueJobs(): void {
  if (dueJobsGlobal.__postlineDueJobs) return;
  dueJobsGlobal.__postlineDueJobs = true;
  const tick = () => {
    void processDueJobs();
  };
  setTimeout(tick, 8_000);
  setInterval(tick, 60_000);
}

const listInflight = new Map<string, ReturnType<typeof listMailUncached>>();

export async function listMail(opts: {
  folder: MailFolderId;
  page: number;
  pageSize: number;
  sort?: MailSort;
  filters?: MailSearchFilters;
}): Promise<Awaited<ReturnType<typeof listMailUncached>>> {
  const key = JSON.stringify({
    folder: opts.folder,
    page: opts.page,
    pageSize: opts.pageSize,
    sort: opts.sort ?? "date_desc",
    filters: opts.filters ?? {},
  });
  const existing = listInflight.get(key);
  if (existing) return existing;
  const pending = listMailUncached(opts).finally(() => {
    listInflight.delete(key);
  });
  listInflight.set(key, pending);
  return pending;
}

async function listMailUncached(opts: {
  folder: MailFolderId;
  page: number;
  pageSize: number;
  sort?: MailSort;
  filters?: MailSearchFilters;
}): Promise<{
  items: MailListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  mailbox?: string;
  accountEmail: string;
  searchSummary?: string;
}> {
  ensureDueJobs();
  const accountEmail = await getAccountEmail();
  const pageSize = Math.min(50, Math.max(1, opts.pageSize || 20));
  const page = Math.max(1, opts.page || 1);
  const sort = opts.sort ?? "date_desc";
  const filters: MailSearchFilters = {
    ...(opts.filters ?? {}),
  };
  const searchSummary = hasActiveSearch(filters) ? describeSearch(filters) : undefined;

  const pageLocal = (items: MailListItem[]) => {
    const filtered = filterLocalMailItems(items, filters);
    const sorted = sortItems(filtered, sort);
    const paged = paginateItems(sorted, page, pageSize);
    return { ...paged, accountEmail, searchSummary };
  };

  if (opts.folder === "drafts" && filters.scope !== "all_folders") {
    return pageLocal(await listAllDrafts(accountEmail));
  }
  if (opts.folder === "scheduled" && filters.scope !== "all_folders") {
    return pageLocal((await listAllScheduled(accountEmail)).items);
  }
  if (opts.folder === "snoozed" && filters.scope !== "all_folders") {
    return pageLocal(await listAllSnoozed(accountEmail));
  }

  return withImapClient(async (client) => {
    // —— Single folder (accurate UID pagination) ——
    if (filters.scope !== "all_folders") {
      const target = await mailboxForFolder(client, opts.folder);
      if (!target.search && !hasActiveSearch(filters) && (sort === "date_desc" || sort === "date_asc")) {
        const latest = await fetchSequencePage(
          client,
          target.mailbox,
          page,
          pageSize,
          sort === "date_desc",
        );
        return {
          items: latest.items,
          total: latest.total,
          page: latest.page,
          pageSize,
          totalPages: latest.totalPages,
          mailbox: target.mailbox,
          accountEmail,
          searchSummary,
        };
      }
      const uids = await searchMailboxUids(client, target.mailbox, target.search, filters);
      const total = uids.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
      const currentPage = Math.min(page, totalPages);
      const start = (currentPage - 1) * pageSize;
      const pageUids = uids.slice(start, start + pageSize);
      const items = await fetchPageFromMailbox(client, target.mailbox, pageUids);
      let finalItems = sortItems(items, sort);
      if (filters.hasAttachment) {
        finalItems = finalItems.filter((i) => i.hasAttachments);
      }
      return {
        items: finalItems,
        total: filters.hasAttachment ? finalItems.length : total,
        page: currentPage,
        pageSize,
        totalPages: filters.hasAttachment
          ? Math.max(1, Math.ceil(finalItems.length / pageSize) || 1)
          : totalPages,
        mailbox: target.mailbox,
        accountEmail,
        searchSummary,
      };
    }

    // —— All folders: search major mailboxes + local drafts/scheduled/snoozed ——
    type Hit = { mailbox: string; uid: number };
    const hits: Hit[] = [];
    const seenKeys = new Set<string>();

    for (const folderId of CROSS_FOLDER_IDS) {
      try {
        const target = await mailboxForFolder(client, folderId);
        // Cap per-folder matches for responsiveness on huge mailboxes.
        const uids = (await searchMailboxUids(client, target.mailbox, target.search, filters)).slice(
          0,
          200,
        );
        for (const uid of uids) {
          const key = `${target.mailbox}:${uid}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          hits.push({ mailbox: target.mailbox, uid });
        }
      } catch {
        /* skip unavailable folder */
      }
    }

    const byMailbox = new Map<string, number[]>();
    for (const hit of hits) {
      const list = byMailbox.get(hit.mailbox) ?? [];
      list.push(hit.uid);
      byMailbox.set(hit.mailbox, list);
    }

    const imapItems: MailListItem[] = [];
    for (const [mailbox, uids] of byMailbox) {
      try {
        // Fetch in chunks to avoid huge IMAP payloads.
        for (let i = 0; i < uids.length; i += 40) {
          const chunk = uids.slice(i, i + 40);
          imapItems.push(...(await fetchPageFromMailbox(client, mailbox, chunk)));
        }
      } catch {
        /* ignore */
      }
    }

    const localExtras = filterLocalMailItems(
      [
        ...(await listAllDrafts(accountEmail)),
        ...(await listAllScheduled(accountEmail)).items,
        ...(await listAllSnoozed(accountEmail)),
      ],
      filters,
    );

    let combined = sortItems([...imapItems, ...localExtras], sort);
    if (filters.hasAttachment) {
      combined = combined.filter((i) => i.hasAttachments);
    }
    const paged = paginateItems(combined, page, pageSize);

    return {
      ...paged,
      accountEmail,
      searchSummary,
    };
  });
}

export { describeSearch, hasActiveSearch };

export async function getMailMessage(
  mailbox: string,
  uid: number,
): Promise<MailMessage | null> {
  return withImapMailbox(mailbox, async (client) => {
    const message = await client.fetchOne(
      String(uid),
      { uid: true, flags: true, envelope: true, source: true },
      { uid: true },
    );
    if (!message) return null;

    const envelope = message.envelope;
    const from = firstAddress(envelope?.from);
    const flags = message.flags ?? new Set<string>();
    const parsed = message.source ? await simpleParser(message.source) : null;
    const html =
      typeof parsed?.html === "string"
        ? parsed.html
        : parsed?.textAsHtml ||
          (parsed?.text
            ? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(parsed.text)}</pre>`
            : "");
    const text = parsed?.text?.trim() || (html ? stripHtml(html) : "");

    try {
      await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
    } catch {
      /* ignore */
    }

    return {
      id: `imap:${mailbox}:${uid}`,
      source: "imap",
      uid,
      mailbox,
      subject: envelope?.subject?.trim() || parsed?.subject?.trim() || "(no subject)",
      fromName: from.name,
      fromEmail: from.email,
      to: addressListToString(envelope?.to),
      cc: addressListToString(envelope?.cc),
      date: envelope?.date ? new Date(envelope.date).toISOString() : null,
      seen: true,
      starred: flags.has("\\Flagged"),
      important: flags.has("$Important") || flags.has("\\Important"),
      preview: text.slice(0, 160),
      hasAttachments: (parsed?.attachments?.length ?? 0) > 0,
      text,
      html: html || `<p>${escapeHtml(text || "(empty message)")}</p>`,
      attachments: (parsed?.attachments ?? []).map((a) => ({
        filename: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        size: a.size || a.content?.length || 0,
      })),
    };
  });
}

export async function getLocalMailMessage(
  folder: "drafts" | "scheduled" | "snoozed",
  localId: string,
): Promise<MailMessage | null> {
  const accountEmail = await getAccountEmail();
  if (folder === "drafts") {
    const d = await getDraft(localId);
    if (!d || d.accountEmail !== accountEmail) return null;
    return {
      id: `local:${d.id}`,
      source: "local",
      localId: d.id,
      subject: d.subject,
      fromName: "Draft",
      fromEmail: accountEmail,
      to: d.toAddrs,
      cc: d.ccAddrs || "",
      date: d.updatedAt.toISOString(),
      seen: true,
      starred: false,
      important: false,
      preview: "",
      hasAttachments: false,
      text: stripHtml(d.bodyHtml),
      html: d.bodyHtml,
      attachments: [],
      folderHint: "drafts",
    };
  }
  if (folder === "scheduled") {
    const s = await getScheduled(localId);
    if (!s || s.accountEmail !== accountEmail) return null;
    return {
      id: `local:${s.id}`,
      source: "local",
      localId: s.id,
      subject: s.subject,
      fromName: "Scheduled",
      fromEmail: accountEmail,
      to: s.toAddrs,
      cc: s.ccAddrs || "",
      date: s.sendAt.toISOString(),
      seen: true,
      starred: false,
      important: false,
      preview: "",
      hasAttachments: false,
      text: stripHtml(s.bodyHtml),
      html: s.bodyHtml,
      attachments: [],
      folderHint: "scheduled",
    };
  }
  return null;
}

async function applyImapAction(
  client: ImapFlow,
  mailbox: string,
  uids: number[],
  action: MailAction,
  snoozeWakeAt?: Date,
  meta?: { subject: string; fromName: string; fromEmail: string; preview: string },
): Promise<void> {
  if (uids.length === 0) return;
  const boxes = await resolveMailboxes(client);
  const lock = await client.getMailboxLock(mailbox);
  try {
    switch (action) {
      case "star":
        await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
        break;
      case "unstar":
        await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
        break;
      case "important":
        try {
          await client.messageFlagsAdd(uids, ["$Important"], { uid: true });
        } catch {
          /* provider may not support */
        }
        break;
      case "unimportant":
        try {
          await client.messageFlagsRemove(uids, ["$Important"], { uid: true });
        } catch {
          /* ignore */
        }
        break;
      case "read":
        await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
        break;
      case "unread":
        await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
        break;
      case "archive":
        if (mailbox !== boxes.all) {
          await client.messageMove(uids, boxes.all, { uid: true });
        }
        break;
      case "spam":
        await client.messageMove(uids, boxes.spam, { uid: true });
        break;
      case "unspam":
        await client.messageMove(uids, boxes.inbox, { uid: true });
        break;
      case "trash":
        await client.messageMove(uids, boxes.trash, { uid: true });
        break;
      case "restore":
        await client.messageMove(uids, boxes.inbox, { uid: true });
        break;
      case "delete":
        await client.messageDelete(uids, { uid: true });
        break;
      case "snooze": {
        if (!snoozeWakeAt) throw new Error("snoozeWakeAt required");
        const accountEmail = await getAccountEmail();
        for (const uid of uids) {
          await createSnooze({
            accountEmail,
            mailbox,
            uid,
            subject: meta?.subject || "(no subject)",
            fromName: meta?.fromName || "",
            fromEmail: meta?.fromEmail || "",
            preview: meta?.preview || "",
            wakeAt: snoozeWakeAt,
          });
        }
        // Archive away from inbox until wake
        if (mailbox === boxes.inbox) {
          await client.messageMove(uids, boxes.all, { uid: true });
        }
        break;
      }
      default:
        break;
    }
  } finally {
    lock.release();
  }
}

export async function runMailActions(input: {
  action: MailAction;
  targets: { mailbox?: string; uid?: number; localId?: string; source: "imap" | "local" }[];
  snoozeUntil?: string;
  folder?: MailFolderId;
}): Promise<{ ok: number; errors: string[] }> {
  const errors: string[] = [];
  let ok = 0;

  const localIds = input.targets
    .filter((t) => t.source === "local" && t.localId)
    .map((t) => t.localId!) ;

  if (localIds.length) {
    const destructive = input.action === "delete" || input.action === "trash";
    if (input.folder === "drafts" && destructive) {
      ok += await deleteDrafts(localIds);
    } else if (input.folder === "scheduled" && destructive) {
      ok += await cancelScheduled(localIds);
    } else if (input.folder === "snoozed" && (destructive || input.action === "restore")) {
      ok += await deleteSnoozed(localIds);
    }
  }

  const imapTargets = input.targets.filter(
    (t) => t.source === "imap" && t.mailbox && typeof t.uid === "number",
  );
  if (imapTargets.length === 0) return { ok, errors };

  const byMailbox = new Map<string, number[]>();
  for (const t of imapTargets) {
    const list = byMailbox.get(t.mailbox!) ?? [];
    list.push(t.uid!);
    byMailbox.set(t.mailbox!, list);
  }

  const wakeAt = input.snoozeUntil ? new Date(input.snoozeUntil) : undefined;

  await withImapClient(async (client) => {
    for (const [mailbox, uids] of byMailbox) {
      try {
        await applyImapAction(client, mailbox, uids, input.action, wakeAt);
        ok += uids.length;
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  });

  return { ok, errors };
}

export async function composeMail(input: MailComposeInput): Promise<{
  mode: "sent" | "scheduled" | "draft";
  id?: string;
}> {
  const accountEmail = await getAccountEmail();
  if (!input.to.trim()) throw new Error("Recipient (To) is required.");

  if (input.draftId && !input.sendAt) {
    // Saving as draft only when explicitly requested via separate endpoint;
  }

  if (input.sendAt) {
    const sendAt = new Date(input.sendAt);
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
      throw new Error("Schedule time must be in the future.");
    }
    const row = await createScheduled({
      accountEmail,
      toAddrs: input.to.trim(),
      ccAddrs: input.cc?.trim(),
      subject: input.subject.trim() || "(no subject)",
      bodyHtml: input.bodyHtml || "<p></p>",
      sendAt,
    });
    if (input.draftId) await deleteDrafts([input.draftId]);
    return { mode: "scheduled", id: row.id };
  }

  const transporter = await getTransporter();
  await transporter.sendMail({
    from: accountEmail,
    to: input.to.trim(),
    cc: input.cc?.trim() || undefined,
    subject: input.subject.trim() || "(no subject)",
    html: input.bodyHtml || "<p></p>",
  });
  if (input.draftId) await deleteDrafts([input.draftId]);
  return { mode: "sent" };
}

export async function saveDraftMail(input: MailComposeInput): Promise<{ id: string }> {
  const accountEmail = await getAccountEmail();
  const row = await upsertDraft({
    id: input.draftId,
    accountEmail,
    toAddrs: input.to.trim(),
    ccAddrs: input.cc?.trim(),
    subject: input.subject.trim() || "(no subject)",
    bodyHtml: input.bodyHtml || "<p></p>",
  });
  return { id: row.id };
}

export async function rescheduleMail(
  id: string,
  sendAt: string,
): Promise<void> {
  const at = new Date(sendAt);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
    throw new Error("Schedule time must be in the future.");
  }
  const updated = await updateScheduled(id, { sendAt: at, status: "PENDING", errorMessage: null });
  if (!updated) throw new Error("Scheduled message not found.");
}
