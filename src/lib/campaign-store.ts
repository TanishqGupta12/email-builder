import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { attachments, campaigns, recipients } from "@/lib/db/schema";

export type RecipientStatus = "PENDING" | "SENT" | "FAILED";

export type CampaignStatus = "QUEUED" | "SENDING" | "COMPLETED";

export type Recipient = {
  id: string;
  email: string;
  status: RecipientStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  /** Present when loaded for send/download; omitted from list queries. */
  contentBase64?: string | null;
};

export type Campaign = {
  id: string;
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  sendMode: string;
  delayMs: number;
  status: CampaignStatus;
  invalidEmails: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  recipients: Recipient[];
  attachments: Attachment[];
};

type CampaignRow = typeof campaigns.$inferSelect;
type RecipientRow = typeof recipients.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;

function parseInvalidEmails(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function toRecipient(row: RecipientRow): Recipient {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    path: row.path,
    contentBase64: row.contentBase64 ?? null,
  };
}

function toCampaign(
  row: CampaignRow,
  recipientRows: RecipientRow[],
  attachmentRows: AttachmentRow[],
): Campaign {
  return {
    id: row.id,
    senderEmail: row.senderEmail,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    sendMode: row.sendMode,
    delayMs: row.delayMs,
    status: row.status,
    invalidEmails: parseInvalidEmails(row.invalidEmails),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recipients: recipientRows.map(toRecipient),
    attachments: attachmentRows.map(toAttachment),
  };
}

async function rowsForCampaigns(
  ids: string[],
  opts: { includeContent?: boolean } = {},
): Promise<{
  recipientRows: RecipientRow[];
  attachmentRows: AttachmentRow[];
}> {
  if (ids.length === 0) return { recipientRows: [], attachmentRows: [] };
  const db = await getDb();
  const recipientRows = await db
    .select()
    .from(recipients)
    .where(inArray(recipients.campaignId, ids))
    .orderBy(asc(sql`rowid`))
    .all();

  if (opts.includeContent) {
    return {
      recipientRows,
      attachmentRows: await db
        .select()
        .from(attachments)
        .where(inArray(attachments.campaignId, ids))
        .orderBy(asc(sql`rowid`))
        .all(),
    };
  }

  // List views skip base64 payloads to keep responses small.
  const meta = await db
    .select({
      id: attachments.id,
      campaignId: attachments.campaignId,
      filename: attachments.filename,
      originalName: attachments.originalName,
      mimeType: attachments.mimeType,
      size: attachments.size,
      path: attachments.path,
    })
    .from(attachments)
    .where(inArray(attachments.campaignId, ids))
    .orderBy(asc(sql`rowid`))
    .all();

  return {
    recipientRows,
    attachmentRows: meta.map((row) => ({ ...row, contentBase64: null })),
  };
}

function groupByCampaign<T extends { campaignId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.campaignId);
    if (list) list.push(row);
    else grouped.set(row.campaignId, [row]);
  }
  return grouped;
}

export async function createCampaign(input: {
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  sendMode: string;
  delayMs: number;
  validEmails: string[];
  invalidEmails: string[] | null;
}): Promise<Campaign> {
  const id = randomUUID();
  const now = new Date();
  const recipientRecords: Recipient[] = input.validEmails.map((email) => ({
    id: randomUUID(),
    email,
    status: "PENDING",
    errorMessage: null,
    sentAt: null,
    createdAt: now,
  }));

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(campaigns)
      .values({
        id,
        senderEmail: input.senderEmail,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        sendMode: input.sendMode,
        delayMs: input.delayMs,
        status: "QUEUED",
        invalidEmails: input.invalidEmails ? JSON.stringify(input.invalidEmails) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (let i = 0; i < recipientRecords.length; i += 200) {
      await tx
        .insert(recipients)
        .values(
          recipientRecords.slice(i, i + 200).map((recipient) => ({
            id: recipient.id,
            campaignId: id,
            email: recipient.email,
            status: recipient.status,
            errorMessage: recipient.errorMessage,
            sentAt: recipient.sentAt,
            createdAt: recipient.createdAt,
          })),
        )
        .run();
    }
  });

  return {
    id,
    senderEmail: input.senderEmail,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    sendMode: input.sendMode,
    delayMs: input.delayMs,
    status: "QUEUED",
    invalidEmails: input.invalidEmails,
    createdAt: now,
    updatedAt: now,
    recipients: recipientRecords,
    attachments: [],
  };
}

export async function addCampaignAttachment(
  campaignId: string,
  input: Omit<Attachment, "id">,
): Promise<Attachment | undefined> {
  const db = await getDb();
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();
  if (!existing) return undefined;

  const attachment: Attachment = { id: randomUUID(), ...input };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(attachments)
      .values({
        id: attachment.id,
        campaignId,
        filename: attachment.filename,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        path: attachment.path,
        contentBase64: attachment.contentBase64 ?? null,
      })
      .run();
    await tx.update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, campaignId)).run();
  });
  return attachment;
}

export async function getCampaign(
  id: string,
  opts: { includeContent?: boolean } = { includeContent: true },
): Promise<Campaign | undefined> {
  const db = await getDb();
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) return undefined;
  const { recipientRows, attachmentRows } = await rowsForCampaigns([id], {
    includeContent: opts.includeContent !== false,
  });
  return toCampaign(row, recipientRows, attachmentRows);
}

export async function listRecentCampaigns(limit: number): Promise<Campaign[]> {
  const page = await listCampaignsPage(1, limit);
  return page.items;
}

export type CampaignsPage = {
  items: Campaign[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listCampaignsPage(
  page: number,
  pageSize: number,
  q?: string,
): Promise<CampaignsPage> {
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 10));
  const safePage = Math.max(1, Math.floor(page) || 1);
  const db = await getDb();
  const needle = q?.trim() ?? "";

  let matchedIds: string[] | null = null;
  if (needle) {
    const pattern = `%${needle}%`;
    const byFields = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        or(
          like(campaigns.subject, pattern),
          like(campaigns.senderEmail, pattern),
          like(campaigns.status, pattern),
        ),
      )
      .all();
    const byRecipient = await db
      .selectDistinct({ id: recipients.campaignId })
      .from(recipients)
      .where(like(recipients.email, pattern))
      .all();
    matchedIds = [
      ...new Set([
        ...byFields.map((r) => r.id),
        ...byRecipient.map((r) => r.id),
      ]),
    ];
  }

  if (matchedIds && matchedIds.length === 0) {
    return {
      items: [],
      total: 0,
      page: 1,
      pageSize: safePageSize,
      totalPages: 1,
    };
  }

  const total =
    matchedIds == null
      ? Number((await db.select({ n: count() }).from(campaigns).get())?.n ?? 0)
      : matchedIds.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const currentPage = Math.min(safePage, totalPages);
  const offset = (currentPage - 1) * safePageSize;

  const rows =
    total === 0
      ? []
      : matchedIds == null
        ? await db
            .select()
            .from(campaigns)
            .orderBy(desc(campaigns.createdAt))
            .limit(safePageSize)
            .offset(offset)
            .all()
        : await db
            .select()
            .from(campaigns)
            .where(inArray(campaigns.id, matchedIds))
            .orderBy(desc(campaigns.createdAt))
            .limit(safePageSize)
            .offset(offset)
            .all();

  const ids = rows.map((row) => row.id);
  const { recipientRows, attachmentRows } = await rowsForCampaigns(ids, {
    includeContent: false,
  });
  const recipientsByCampaign = groupByCampaign(recipientRows);
  const attachmentsByCampaign = groupByCampaign(attachmentRows);
  const items = rows.map((row) =>
    toCampaign(
      row,
      recipientsByCampaign.get(row.id) ?? [],
      attachmentsByCampaign.get(row.id) ?? [],
    ),
  );

  return {
    items,
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
  };
}

/** Permanently remove campaigns and related recipients/attachments from the DB. */
export async function deleteCampaigns(ids: string[]): Promise<number> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return 0;

  const db = await getDb();
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(inArray(campaigns.id, unique))
    .all();
  const toDelete = existing.map((row) => row.id);
  if (toDelete.length === 0) return 0;

  // Chunk to stay within SQLite variable limits.
  for (let i = 0; i < toDelete.length; i += 200) {
    const chunk = toDelete.slice(i, i + 200);
    await db.transaction(async (tx) => {
      await tx.delete(attachments).where(inArray(attachments.campaignId, chunk)).run();
      await tx.delete(recipients).where(inArray(recipients.campaignId, chunk)).run();
      await tx.delete(campaigns).where(inArray(campaigns.id, chunk)).run();
    });
  }
  return toDelete.length;
}

export async function deleteAllCampaigns(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: campaigns.id }).from(campaigns).all();
  return deleteCampaigns(rows.map((r) => r.id));
}

export async function setCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  const db = await getDb();
  await db
    .update(campaigns)
    .set({ status, updatedAt: new Date() })
    .where(eq(campaigns.id, id))
    .run();
}

export async function patchRecipient(
  campaignId: string,
  recipientId: string,
  patch: Partial<Pick<Recipient, "status" | "errorMessage" | "sentAt">>,
): Promise<void> {
  const db = await getDb();
  const set: {
    status?: RecipientStatus;
    errorMessage?: string | null;
    sentAt?: Date | null;
  } = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.errorMessage !== undefined) set.errorMessage = patch.errorMessage;
  if (patch.sentAt !== undefined) set.sentAt = patch.sentAt;

  await db.transaction(async (tx) => {
    const result = await tx
      .update(recipients)
      .set(set)
      .where(and(eq(recipients.id, recipientId), eq(recipients.campaignId, campaignId)))
      .run();
    if (result.rowsAffected === 0) return;
    await tx
      .update(campaigns)
      .set({ updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId))
      .run();
  });
}

export async function failAllPendingRecipients(
  campaignId: string,
  errorMessage: string,
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .get();
  if (!existing) return;

  await db.transaction(async (tx) => {
    await tx
      .update(recipients)
      .set({ status: "FAILED", errorMessage })
      .where(and(eq(recipients.campaignId, campaignId), eq(recipients.status, "PENDING")))
      .run();
    await tx
      .update(campaigns)
      .set({ updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId))
      .run();
  });
}

/** Reset FAILED (and optionally keep PENDING) so a stuck campaign can be retried. */
export async function prepareCampaignRetry(
  campaignId: string,
  opts: { includeFailed?: boolean } = { includeFailed: true },
): Promise<{ ok: true; pendingCount: number } | { ok: false; error: string }> {
  const campaign = await getCampaign(campaignId, { includeContent: false });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const includeFailed = opts.includeFailed !== false;
  const retryable = campaign.recipients.filter(
    (r) => r.status === "PENDING" || (includeFailed && r.status === "FAILED"),
  );
  if (retryable.length === 0) {
    return { ok: false, error: "No pending or failed recipients to retry." };
  }

  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    if (includeFailed) {
      await tx
        .update(recipients)
        .set({ status: "PENDING", errorMessage: null, sentAt: null })
        .where(and(eq(recipients.campaignId, campaignId), eq(recipients.status, "FAILED")))
        .run();
    }
    await tx
      .update(campaigns)
      .set({ status: "QUEUED", updatedAt: now })
      .where(eq(campaigns.id, campaignId))
      .run();
  });

  return { ok: true, pendingCount: retryable.length };
}

export type RecipientDirectoryEntry = {
  email: string;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  campaignCount: number;
  lastActivityAt: Date | null;
  recentCampaigns: {
    campaignId: string;
    subject: string;
    campaignStatus: CampaignStatus;
    recipientStatus: RecipientStatus;
    senderEmail: string;
    createdAt: Date;
    errorMessage: string | null;
  }[];
};

function buildRecipientDirectory(
  rows: {
    email: string;
    status: RecipientStatus;
    errorMessage: string | null;
    sentAt: Date | null;
    campaignId: string;
    subject: string;
    campaignStatus: CampaignStatus;
    senderEmail: string;
    campaignCreatedAt: Date;
  }[],
): RecipientDirectoryEntry[] {
  const byEmail = new Map<string, RecipientDirectoryEntry>();

  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (!key) continue;
    let entry = byEmail.get(key);
    if (!entry) {
      entry = {
        email: row.email.trim(),
        sentCount: 0,
        failedCount: 0,
        pendingCount: 0,
        campaignCount: 0,
        lastActivityAt: null,
        recentCampaigns: [],
      };
      byEmail.set(key, entry);
    }

    if (row.status === "SENT") entry.sentCount += 1;
    else if (row.status === "FAILED") entry.failedCount += 1;
    else entry.pendingCount += 1;

    entry.campaignCount += 1;
    const activity = row.sentAt ?? row.campaignCreatedAt;
    if (!entry.lastActivityAt || activity > entry.lastActivityAt) {
      entry.lastActivityAt = activity;
    }

    if (entry.recentCampaigns.length < 8) {
      entry.recentCampaigns.push({
        campaignId: row.campaignId,
        subject: row.subject,
        campaignStatus: row.campaignStatus,
        recipientStatus: row.status,
        senderEmail: row.senderEmail,
        createdAt: row.campaignCreatedAt,
        errorMessage: row.errorMessage,
      });
    }
  }

  return [...byEmail.values()].sort((a, b) => {
    const at = a.lastActivityAt?.getTime() ?? 0;
    const bt = b.lastActivityAt?.getTime() ?? 0;
    return bt - at;
  });
}

export type RecipientsPage = {
  items: RecipientDirectoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Unique recipient emails with recent campaign history for reuse. */
export async function listRecipientDirectory(
  limit = 200,
): Promise<RecipientDirectoryEntry[]> {
  const page = await listRecipientsPage(1, limit);
  return page.items;
}

export type RecipientUsageEvent = {
  campaignId: string;
  subject: string;
  bodyHtml: string;
  senderEmail: string;
  campaignStatus: CampaignStatus;
  recipientStatus: RecipientStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
  attachmentCount: number;
};

export type RecipientUsageTimeline = {
  email: string;
  usedBefore: boolean;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  events: RecipientUsageEvent[];
};

/** Full send timeline for one recipient email (newest first). */
export async function getRecipientUsageTimeline(
  email: string,
): Promise<RecipientUsageTimeline> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return {
      email: email.trim(),
      usedBefore: false,
      sentCount: 0,
      failedCount: 0,
      pendingCount: 0,
      events: [],
    };
  }

  const db = await getDb();
  const rows = await db
    .select({
      campaignId: campaigns.id,
      subject: campaigns.subject,
      bodyHtml: campaigns.bodyHtml,
      senderEmail: campaigns.senderEmail,
      campaignStatus: campaigns.status,
      createdAt: campaigns.createdAt,
      recipientEmail: recipients.email,
      recipientStatus: recipients.status,
      errorMessage: recipients.errorMessage,
      sentAt: recipients.sentAt,
    })
    .from(recipients)
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .where(sql`lower(${recipients.email}) = ${normalized}`)
    .orderBy(desc(campaigns.createdAt))
    .all();

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const attachmentCounts = new Map<string, number>();
  if (campaignIds.length > 0) {
    const attRows = await db
      .select({
        campaignId: attachments.campaignId,
        n: count(),
      })
      .from(attachments)
      .where(inArray(attachments.campaignId, campaignIds))
      .groupBy(attachments.campaignId)
      .all();
    for (const row of attRows) {
      attachmentCounts.set(row.campaignId, Number(row.n ?? 0));
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  const events: RecipientUsageEvent[] = rows.map((row) => {
    if (row.recipientStatus === "SENT") sentCount += 1;
    else if (row.recipientStatus === "FAILED") failedCount += 1;
    else pendingCount += 1;
    return {
      campaignId: row.campaignId,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
      senderEmail: row.senderEmail,
      campaignStatus: row.campaignStatus,
      recipientStatus: row.recipientStatus,
      errorMessage: row.errorMessage,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      attachmentCount: attachmentCounts.get(row.campaignId) ?? 0,
    };
  });

  return {
    email: rows[0]?.recipientEmail?.trim() || email.trim(),
    usedBefore: events.length > 0,
    sentCount,
    failedCount,
    pendingCount,
    events,
  };
}

/** Quick check which addresses already appear in campaign history. */
export async function checkRecipientsUsedBefore(
  emails: string[],
): Promise<
  {
    email: string;
    usedBefore: boolean;
    sentCount: number;
    failedCount: number;
    lastActivityAt: Date | null;
    lastSubject: string | null;
  }[]
> {
  const unique = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];

  const db = await getDb();
  const rows = await db
    .select({
      email: recipients.email,
      status: recipients.status,
      sentAt: recipients.sentAt,
      subject: campaigns.subject,
      createdAt: campaigns.createdAt,
    })
    .from(recipients)
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .orderBy(desc(campaigns.createdAt))
    .all();

  const byEmail = new Map<
    string,
    {
      email: string;
      usedBefore: boolean;
      sentCount: number;
      failedCount: number;
      lastActivityAt: Date | null;
      lastSubject: string | null;
    }
  >();

  for (const key of unique) {
    byEmail.set(key, {
      email: key,
      usedBefore: false,
      sentCount: 0,
      failedCount: 0,
      lastActivityAt: null,
      lastSubject: null,
    });
  }

  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    const entry = byEmail.get(key);
    if (!entry) continue;
    entry.usedBefore = true;
    entry.email = row.email.trim();
    if (row.status === "SENT") entry.sentCount += 1;
    else if (row.status === "FAILED") entry.failedCount += 1;
    const activity = row.sentAt ?? row.createdAt;
    if (!entry.lastActivityAt || activity > entry.lastActivityAt) {
      entry.lastActivityAt = activity;
      entry.lastSubject = row.subject;
    }
  }

  return unique.map((key) => byEmail.get(key)!);
}

export async function listRecipientsPage(
  page: number,
  pageSize: number,
  q?: string,
): Promise<RecipientsPage> {
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 10));
  const safePage = Math.max(1, Math.floor(page) || 1);
  const db = await getDb();
  const rows = await db
    .select({
      email: recipients.email,
      status: recipients.status,
      errorMessage: recipients.errorMessage,
      sentAt: recipients.sentAt,
      campaignId: campaigns.id,
      subject: campaigns.subject,
      campaignStatus: campaigns.status,
      senderEmail: campaigns.senderEmail,
      campaignCreatedAt: campaigns.createdAt,
    })
    .from(recipients)
    .innerJoin(campaigns, eq(recipients.campaignId, campaigns.id))
    .orderBy(desc(campaigns.createdAt))
    .all();

  const needle = q?.trim().toLowerCase() ?? "";
  let all = buildRecipientDirectory(rows);
  if (needle) {
    all = all.filter((entry) => {
      if (entry.email.toLowerCase().includes(needle)) return true;
      return entry.recentCampaigns.some(
        (c) =>
          c.subject.toLowerCase().includes(needle) ||
          c.senderEmail.toLowerCase().includes(needle) ||
          c.recipientStatus.toLowerCase().includes(needle),
      );
    });
  }

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * safePageSize;

  return {
    items: all.slice(start, start + safePageSize),
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
  };
}

/** Permanently remove recipient rows for the given emails (case-insensitive). */
export async function deleteRecipientsByEmails(emails: string[]): Promise<number> {
  const keys = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (keys.length === 0) return 0;

  const db = await getDb();
  const allRows = await db
    .select({ id: recipients.id, email: recipients.email })
    .from(recipients)
    .all();
  const ids = allRows
    .filter((row) => keys.includes(row.email.trim().toLowerCase()))
    .map((row) => row.id);

  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const result = await db.delete(recipients).where(inArray(recipients.id, chunk)).run();
    deleted += Number(result.rowsAffected ?? 0);
  }
  return deleted;
}

export async function deleteAllRecipients(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: recipients.id }).from(recipients).all();
  if (rows.length === 0) return 0;
  let deleted = 0;
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const result = await db.delete(recipients).where(inArray(recipients.id, chunk)).run();
    deleted += Number(result.rowsAffected ?? 0);
  }
  return deleted;
}

export async function aggregateStats(): Promise<{
  sent: number;
  failed: number;
  pending: number;
  campaigns: number;
}> {
  const db = await getDb();
  const totals = await db
    .select({
      sent: sql<number>`coalesce(sum(case when ${recipients.status} = 'SENT' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${recipients.status} = 'FAILED' then 1 else 0 end), 0)`,
      pending: sql<number>`coalesce(sum(case when ${recipients.status} = 'PENDING' then 1 else 0 end), 0)`,
    })
    .from(recipients)
    .get();
  const campaignCount = await db.select({ n: count() }).from(campaigns).get();
  return {
    sent: Number(totals?.sent ?? 0),
    failed: Number(totals?.failed ?? 0),
    pending: Number(totals?.pending ?? 0),
    campaigns: Number(campaignCount?.n ?? 0),
  };
}
