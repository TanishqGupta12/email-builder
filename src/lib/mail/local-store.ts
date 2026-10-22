import { randomUUID } from "crypto";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mailDrafts, mailScheduled, mailSnoozed } from "@/lib/db/schema";
import type { MailListItem } from "@/lib/mail/types";

export type DraftRecord = {
  id: string;
  accountEmail: string;
  toAddrs: string;
  ccAddrs: string | null;
  subject: string;
  bodyHtml: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ScheduledRecord = {
  id: string;
  accountEmail: string;
  toAddrs: string;
  ccAddrs: string | null;
  subject: string;
  bodyHtml: string;
  sendAt: Date;
  status: "PENDING" | "SENDING" | "SENT" | "CANCELLED" | "FAILED";
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SnoozedRecord = {
  id: string;
  accountEmail: string;
  mailbox: string;
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  preview: string;
  wakeAt: Date;
  createdAt: Date;
};

export async function listAllDrafts(accountEmail: string): Promise<MailListItem[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(mailDrafts)
    .where(eq(mailDrafts.accountEmail, accountEmail))
    .orderBy(desc(mailDrafts.updatedAt))
    .all();
  return rows.map((r) => ({
    id: `local:${r.id}`,
    source: "local" as const,
    localId: r.id,
    subject: r.subject || "(no subject)",
    fromName: "Draft",
    fromEmail: accountEmail,
    to: r.toAddrs,
    date: r.updatedAt.toISOString(),
    seen: true,
    starred: false,
    important: false,
    preview: r.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    hasAttachments: false,
    folderHint: "drafts",
  }));
}

export async function listDrafts(
  accountEmail: string,
  page: number,
  pageSize: number,
): Promise<{ items: MailListItem[]; total: number }> {
  const all = await listAllDrafts(accountEmail);
  return {
    total: all.length,
    items: all.slice((page - 1) * pageSize, page * pageSize),
  };
}

export async function getDraft(id: string): Promise<DraftRecord | null> {
  const db = await getDb();
  const row = await db.select().from(mailDrafts).where(eq(mailDrafts.id, id)).get();
  return row ?? null;
}

export async function upsertDraft(input: {
  id?: string | null;
  accountEmail: string;
  toAddrs: string;
  ccAddrs?: string;
  subject: string;
  bodyHtml: string;
}): Promise<DraftRecord> {
  const db = await getDb();
  const now = new Date();
  if (input.id) {
    const existing = await getDraft(input.id);
    if (existing) {
      await db
        .update(mailDrafts)
        .set({
          toAddrs: input.toAddrs,
          ccAddrs: input.ccAddrs ?? null,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          updatedAt: now,
        })
        .where(eq(mailDrafts.id, input.id))
        .run();
      return {
        ...existing,
        toAddrs: input.toAddrs,
        ccAddrs: input.ccAddrs ?? null,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        updatedAt: now,
      };
    }
  }
  const id = randomUUID();
  const rec: DraftRecord = {
    id,
    accountEmail: input.accountEmail,
    toAddrs: input.toAddrs,
    ccAddrs: input.ccAddrs ?? null,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(mailDrafts).values(rec).run();
  return rec;
}

export async function deleteDrafts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  let n = 0;
  for (const id of ids) {
    const result = await db.delete(mailDrafts).where(eq(mailDrafts.id, id)).run();
    n += Number(result.rowsAffected ?? 1);
  }
  return n;
}

export async function listAllScheduled(accountEmail: string): Promise<{
  items: MailListItem[];
  records: ScheduledRecord[];
}> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(mailScheduled)
    .where(and(eq(mailScheduled.accountEmail, accountEmail), eq(mailScheduled.status, "PENDING")))
    .orderBy(asc(mailScheduled.sendAt))
    .all();
  return {
    records: rows,
    items: rows.map((r) => ({
      id: `local:${r.id}`,
      source: "local" as const,
      localId: r.id,
      subject: r.subject || "(no subject)",
      fromName: "Scheduled",
      fromEmail: accountEmail,
      to: r.toAddrs,
      date: r.sendAt.toISOString(),
      seen: true,
      starred: false,
      important: false,
      preview: `Sends ${r.sendAt.toLocaleString()}`,
      hasAttachments: false,
      folderHint: "scheduled",
    })),
  };
}

export async function listScheduled(
  accountEmail: string,
  page: number,
  pageSize: number,
): Promise<{ items: MailListItem[]; total: number; records: ScheduledRecord[] }> {
  const { items, records } = await listAllScheduled(accountEmail);
  const start = (page - 1) * pageSize;
  return {
    total: items.length,
    records: records.slice(start, start + pageSize),
    items: items.slice(start, start + pageSize),
  };
}

export async function getScheduled(id: string): Promise<ScheduledRecord | null> {
  const db = await getDb();
  const row = await db.select().from(mailScheduled).where(eq(mailScheduled.id, id)).get();
  return row ?? null;
}

export async function createScheduled(input: {
  accountEmail: string;
  toAddrs: string;
  ccAddrs?: string;
  subject: string;
  bodyHtml: string;
  sendAt: Date;
}): Promise<ScheduledRecord> {
  const db = await getDb();
  const now = new Date();
  const rec: ScheduledRecord = {
    id: randomUUID(),
    accountEmail: input.accountEmail,
    toAddrs: input.toAddrs,
    ccAddrs: input.ccAddrs ?? null,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    sendAt: input.sendAt,
    status: "PENDING",
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(mailScheduled).values(rec).run();
  return rec;
}

export async function updateScheduled(
  id: string,
  patch: Partial<{
    toAddrs: string;
    ccAddrs: string | null;
    subject: string;
    bodyHtml: string;
    sendAt: Date;
    status: ScheduledRecord["status"];
    errorMessage: string | null;
  }>,
): Promise<ScheduledRecord | null> {
  const current = await getScheduled(id);
  if (!current) return null;
  const db = await getDb();
  const next = { ...current, ...patch, updatedAt: new Date() };
  await db.update(mailScheduled).set(next).where(eq(mailScheduled.id, id)).run();
  return next;
}

export async function cancelScheduled(ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const updated = await updateScheduled(id, { status: "CANCELLED" });
    if (updated) n += 1;
  }
  return n;
}

export async function dueScheduled(limit = 20): Promise<ScheduledRecord[]> {
  const db = await getDb();
  const now = new Date();
  return db
    .select()
    .from(mailScheduled)
    .where(and(eq(mailScheduled.status, "PENDING"), lte(mailScheduled.sendAt, now)))
    .orderBy(asc(mailScheduled.sendAt))
    .limit(limit)
    .all();
}

export async function listAllSnoozed(accountEmail: string): Promise<MailListItem[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(mailSnoozed)
    .where(eq(mailSnoozed.accountEmail, accountEmail))
    .orderBy(asc(mailSnoozed.wakeAt))
    .all();
  return rows.map((r) => ({
    id: `local:${r.id}`,
    source: "local" as const,
    localId: r.id,
    uid: r.uid,
    mailbox: r.mailbox,
    subject: r.subject,
    fromName: r.fromName,
    fromEmail: r.fromEmail,
    to: "",
    date: r.wakeAt.toISOString(),
    seen: true,
    starred: false,
    important: false,
    preview: `Snoozed until ${r.wakeAt.toLocaleString()} · ${r.preview}`,
    hasAttachments: false,
    folderHint: "snoozed",
  }));
}

export async function listSnoozed(
  accountEmail: string,
  page: number,
  pageSize: number,
): Promise<{ items: MailListItem[]; total: number }> {
  const all = await listAllSnoozed(accountEmail);
  return {
    total: all.length,
    items: all.slice((page - 1) * pageSize, page * pageSize),
  };
}

export async function createSnooze(input: {
  accountEmail: string;
  mailbox: string;
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  preview: string;
  wakeAt: Date;
}): Promise<SnoozedRecord> {
  const db = await getDb();
  const rec: SnoozedRecord = {
    id: randomUUID(),
    ...input,
    createdAt: new Date(),
  };
  await db.insert(mailSnoozed).values(rec).run();
  return rec;
}

export async function deleteSnoozed(ids: string[]): Promise<number> {
  const db = await getDb();
  let n = 0;
  for (const id of ids) {
    await db.delete(mailSnoozed).where(eq(mailSnoozed.id, id)).run();
    n += 1;
  }
  return n;
}

export async function dueSnoozed(limit = 50): Promise<SnoozedRecord[]> {
  const db = await getDb();
  const now = new Date();
  return db
    .select()
    .from(mailSnoozed)
    .where(lte(mailSnoozed.wakeAt, now))
    .orderBy(asc(mailSnoozed.wakeAt))
    .limit(limit)
    .all();
}
