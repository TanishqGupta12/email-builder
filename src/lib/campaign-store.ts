import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
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

async function rowsForCampaigns(ids: string[]): Promise<{
  recipientRows: RecipientRow[];
  attachmentRows: AttachmentRow[];
}> {
  if (ids.length === 0) return { recipientRows: [], attachmentRows: [] };
  const db = await getDb();
  return {
    recipientRows: await db
      .select()
      .from(recipients)
      .where(inArray(recipients.campaignId, ids))
      .orderBy(asc(sql`rowid`))
      .all(),
    attachmentRows: await db
      .select()
      .from(attachments)
      .where(inArray(attachments.campaignId, ids))
      .orderBy(asc(sql`rowid`))
      .all(),
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
      })
      .run();
    await tx.update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, campaignId)).run();
  });
  return attachment;
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const db = await getDb();
  const row = await db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!row) return undefined;
  const { recipientRows, attachmentRows } = await rowsForCampaigns([id]);
  return toCampaign(row, recipientRows, attachmentRows);
}

export async function listRecentCampaigns(limit: number): Promise<Campaign[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt))
    .limit(limit)
    .all();
  const ids = rows.map((row) => row.id);
  const { recipientRows, attachmentRows } = await rowsForCampaigns(ids);
  const recipientsByCampaign = groupByCampaign(recipientRows);
  const attachmentsByCampaign = groupByCampaign(attachmentRows);
  return rows.map((row) =>
    toCampaign(
      row,
      recipientsByCampaign.get(row.id) ?? [],
      attachmentsByCampaign.get(row.id) ?? [],
    ),
  );
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
