import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { waAttachments, waBroadcasts, waConnection, waRecipients } from "@/lib/whatsapp/schema";

export type RecipientStatus = "PENDING" | "SENT" | "FAILED";
export type BroadcastStatus = "QUEUED" | "SENDING" | "COMPLETED";

export type WaRecipient = {
  id: string;
  phone: string;
  status: RecipientStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type WaAttachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  contentBase64?: string | null;
};

export type WaBroadcast = {
  id: string;
  message: string;
  delayMs: number;
  status: BroadcastStatus;
  invalidNumbers: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  recipients: WaRecipient[];
  attachments: WaAttachment[];
};

export type BroadcastSummary = {
  id: string;
  message: string;
  delayMs: number;
  status: BroadcastStatus;
  createdAt: Date;
  attachmentName: string | null;
  sent: number;
  failed: number;
  pending: number;
};

export type BroadcastsPage = {
  items: BroadcastSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type WaConnectionRecord = {
  id: string;
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
  createdAt: Date;
  updatedAt: Date;
};

const globalForSeed = globalThis as unknown as {
  __waEnvSeedAttempted?: boolean;
};

function parseInvalid(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function toRecipient(row: typeof waRecipients.$inferSelect): WaRecipient {
  return {
    id: row.id,
    phone: row.phone,
    status: row.status,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
  };
}

function toAttachment(row: typeof waAttachments.$inferSelect): WaAttachment {
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

function toConnection(row: typeof waConnection.$inferSelect): WaConnectionRecord {
  return {
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    accessToken: row.accessToken,
    templateName: row.templateName,
    templateLanguage: row.templateLanguage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function seedWhatsappConnectionFromEnvIfEmpty(): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ n: count() }).from(waConnection).get();
  if (Number(existing?.n ?? 0) > 0) return;
  if (globalForSeed.__waEnvSeedAttempted) return;
  globalForSeed.__waEnvSeedAttempted = true;

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) return;

  const now = new Date();
  await db
    .insert(waConnection)
    .values({
      id: randomUUID(),
      phoneNumberId,
      accessToken,
      templateName: process.env.WHATSAPP_TEMPLATE_NAME?.trim() || "alert",
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en",
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export async function getConnection(): Promise<
  | (Omit<WaConnectionRecord, "accessToken"> & { tokenSet: boolean; tokenHint: string | null })
  | null
> {
  const row = await getConnectionForSend();
  if (!row) return null;
  const hint = row.accessToken.length >= 4 ? row.accessToken.slice(-4) : null;
  return {
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    templateName: row.templateName,
    templateLanguage: row.templateLanguage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tokenSet: row.accessToken.length > 0,
    tokenHint: hint,
  };
}

export async function getConnectionForSend(): Promise<WaConnectionRecord | null> {
  await seedWhatsappConnectionFromEnvIfEmpty();
  const db = await getDb();
  const row = await db.select().from(waConnection).orderBy(desc(waConnection.updatedAt)).get();
  return row ? toConnection(row) : null;
}

export async function saveConnection(input: {
  phoneNumberId: string;
  accessToken?: string;
  templateName: string;
  templateLanguage: string;
}): Promise<WaConnectionRecord> {
  await seedWhatsappConnectionFromEnvIfEmpty();
  const db = await getDb();
  const current = await db.select().from(waConnection).orderBy(desc(waConnection.updatedAt)).get();
  const now = new Date();
  const token = input.accessToken?.trim() || current?.accessToken || "";
  if (!token) {
    throw new Error("Access token is required.");
  }

  if (current) {
    await db
      .update(waConnection)
      .set({
        phoneNumberId: input.phoneNumberId,
        accessToken: token,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage,
        updatedAt: now,
      })
      .where(eq(waConnection.id, current.id))
      .run();
    return {
      ...toConnection(current),
      phoneNumberId: input.phoneNumberId,
      accessToken: token,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      updatedAt: now,
    };
  }

  const created: WaConnectionRecord = {
    id: randomUUID(),
    phoneNumberId: input.phoneNumberId,
    accessToken: token,
    templateName: input.templateName,
    templateLanguage: input.templateLanguage,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(waConnection).values(created).run();
  return created;
}

export async function createBroadcast(input: {
  message: string;
  delayMs: number;
  validPhones: string[];
  invalidNumbers: string[] | null;
}): Promise<WaBroadcast> {
  const id = randomUUID();
  const now = new Date();
  const recipientRecords = input.validPhones.map((phone) => ({
    id: randomUUID(),
    phone,
    status: "PENDING" as const,
    errorMessage: null,
    sentAt: null,
    createdAt: now,
  }));

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(waBroadcasts)
      .values({
        id,
        message: input.message,
        delayMs: input.delayMs,
        status: "QUEUED",
        invalidNumbers: input.invalidNumbers ? JSON.stringify(input.invalidNumbers) : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    for (let i = 0; i < recipientRecords.length; i += 200) {
      await tx
        .insert(waRecipients)
        .values(
          recipientRecords.slice(i, i + 200).map((recipient) => ({
            id: recipient.id,
            broadcastId: id,
            phone: recipient.phone,
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
    message: input.message,
    delayMs: input.delayMs,
    status: "QUEUED",
    invalidNumbers: input.invalidNumbers,
    createdAt: now,
    updatedAt: now,
    recipients: recipientRecords,
    attachments: [],
  };
}

export async function addBroadcastAttachment(
  broadcastId: string,
  input: Omit<WaAttachment, "id">,
): Promise<WaAttachment | undefined> {
  const db = await getDb();
  const existing = await db
    .select({ id: waBroadcasts.id })
    .from(waBroadcasts)
    .where(eq(waBroadcasts.id, broadcastId))
    .get();
  if (!existing) return undefined;

  const attachment: WaAttachment = { id: randomUUID(), ...input };
  await db
    .insert(waAttachments)
    .values({
      id: attachment.id,
      broadcastId,
      filename: attachment.filename,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: attachment.path,
      contentBase64: attachment.contentBase64 ?? null,
    })
    .run();
  await db
    .update(waBroadcasts)
    .set({ updatedAt: new Date() })
    .where(eq(waBroadcasts.id, broadcastId))
    .run();
  return attachment;
}

async function loadChildren(ids: string[], includeContent: boolean) {
  if (ids.length === 0) {
    return { recipients: [] as (typeof waRecipients.$inferSelect)[], attachments: [] as WaAttachment[] };
  }
  const db = await getDb();
  const recipients = await db
    .select()
    .from(waRecipients)
    .where(inArray(waRecipients.broadcastId, ids))
    .orderBy(asc(sql`rowid`))
    .all();

  if (includeContent) {
    const attachments = await db
      .select()
      .from(waAttachments)
      .where(inArray(waAttachments.broadcastId, ids))
      .orderBy(asc(sql`rowid`))
      .all();
    return { recipients, attachments: attachments.map(toAttachment) };
  }

  const meta = await db
    .select({
      id: waAttachments.id,
      broadcastId: waAttachments.broadcastId,
      filename: waAttachments.filename,
      originalName: waAttachments.originalName,
      mimeType: waAttachments.mimeType,
      size: waAttachments.size,
      path: waAttachments.path,
    })
    .from(waAttachments)
    .where(inArray(waAttachments.broadcastId, ids))
    .orderBy(asc(sql`rowid`))
    .all();

  return {
    recipients,
    attachments: meta.map((row) => ({ ...row, contentBase64: null })),
  };
}

export async function getBroadcast(
  id: string,
  opts: { includeContent?: boolean } = {},
): Promise<WaBroadcast | null> {
  const db = await getDb();
  const row = await db.select().from(waBroadcasts).where(eq(waBroadcasts.id, id)).get();
  if (!row) return null;
  const { recipients, attachments } = await loadChildren([id], opts.includeContent === true);
  return {
    id: row.id,
    message: row.message,
    delayMs: row.delayMs,
    status: row.status,
    invalidNumbers: parseInvalid(row.invalidNumbers),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recipients: recipients.filter((item) => item.broadcastId === id).map(toRecipient),
    attachments,
  };
}

export async function listBroadcastsPage(
  page: number,
  pageSize: number,
  q?: string,
): Promise<BroadcastsPage> {
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || 10));
  const safePage = Math.max(1, Math.floor(page) || 1);
  const db = await getDb();
  const needle = q?.trim() ?? "";

  let matchedIds: string[] | null = null;
  if (needle) {
    const pattern = `%${needle}%`;
    const byMessage = await db
      .select({ id: waBroadcasts.id })
      .from(waBroadcasts)
      .where(or(like(waBroadcasts.message, pattern), like(waBroadcasts.status, pattern)))
      .all();
    const byPhone = await db
      .selectDistinct({ id: waRecipients.broadcastId })
      .from(waRecipients)
      .where(like(waRecipients.phone, pattern))
      .all();
    matchedIds = [...new Set([...byMessage.map((row) => row.id), ...byPhone.map((row) => row.id)])];
  }

  if (matchedIds && matchedIds.length === 0) {
    return { items: [], total: 0, page: 1, pageSize: safePageSize, totalPages: 1 };
  }

  const total =
    matchedIds == null
      ? Number((await db.select({ n: count() }).from(waBroadcasts).get())?.n ?? 0)
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
            .from(waBroadcasts)
            .orderBy(desc(waBroadcasts.createdAt))
            .limit(safePageSize)
            .offset(offset)
            .all()
        : await db
            .select()
            .from(waBroadcasts)
            .where(inArray(waBroadcasts.id, matchedIds))
            .orderBy(desc(waBroadcasts.createdAt))
            .limit(safePageSize)
            .offset(offset)
            .all();

  const ids = rows.map((row) => row.id);
  const counts = new Map<string, { sent: number; failed: number; pending: number }>();
  const attachmentNames = new Map<string, string>();

  if (ids.length > 0) {
    const grouped = await db
      .select({
        broadcastId: waRecipients.broadcastId,
        status: waRecipients.status,
        n: count(),
      })
      .from(waRecipients)
      .where(inArray(waRecipients.broadcastId, ids))
      .groupBy(waRecipients.broadcastId, waRecipients.status)
      .all();
    for (const row of grouped) {
      const bucket = counts.get(row.broadcastId) ?? { sent: 0, failed: 0, pending: 0 };
      const n = Number(row.n ?? 0);
      if (row.status === "SENT") bucket.sent += n;
      else if (row.status === "FAILED") bucket.failed += n;
      else bucket.pending += n;
      counts.set(row.broadcastId, bucket);
    }

    const files = await db
      .select({
        broadcastId: waAttachments.broadcastId,
        originalName: waAttachments.originalName,
      })
      .from(waAttachments)
      .where(inArray(waAttachments.broadcastId, ids))
      .all();
    for (const file of files) {
      if (!attachmentNames.has(file.broadcastId)) {
        attachmentNames.set(file.broadcastId, file.originalName);
      }
    }
  }

  return {
    items: rows.map((row) => {
      const tally = counts.get(row.id) ?? { sent: 0, failed: 0, pending: 0 };
      return {
        id: row.id,
        message: row.message,
        delayMs: row.delayMs,
        status: row.status,
        createdAt: row.createdAt,
        attachmentName: attachmentNames.get(row.id) ?? null,
        ...tally,
      };
    }),
    total,
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function setBroadcastStatus(id: string, status: BroadcastStatus): Promise<void> {
  const db = await getDb();
  await db
    .update(waBroadcasts)
    .set({ status, updatedAt: new Date() })
    .where(eq(waBroadcasts.id, id))
    .run();
}

export async function patchRecipient(
  broadcastId: string,
  recipientId: string,
  patch: Partial<Pick<WaRecipient, "status" | "errorMessage" | "sentAt">>,
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
      .update(waRecipients)
      .set(set)
      .where(and(eq(waRecipients.id, recipientId), eq(waRecipients.broadcastId, broadcastId)))
      .run();
    if (result.rowsAffected === 0) return;
    await tx
      .update(waBroadcasts)
      .set({ updatedAt: new Date() })
      .where(eq(waBroadcasts.id, broadcastId))
      .run();
  });
}

export async function failAllPendingRecipients(
  broadcastId: string,
  errorMessage: string,
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(waRecipients)
      .set({ status: "FAILED", errorMessage })
      .where(and(eq(waRecipients.broadcastId, broadcastId), eq(waRecipients.status, "PENDING")))
      .run();
    await tx
      .update(waBroadcasts)
      .set({ updatedAt: new Date() })
      .where(eq(waBroadcasts.id, broadcastId))
      .run();
  });
}

export async function deleteBroadcasts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const existing = await db
    .select({ id: waBroadcasts.id })
    .from(waBroadcasts)
    .where(inArray(waBroadcasts.id, ids))
    .all();
  if (existing.length === 0) return 0;
  const found = existing.map((row) => row.id);
  await db.transaction(async (tx) => {
    await tx.delete(waRecipients).where(inArray(waRecipients.broadcastId, found)).run();
    await tx.delete(waAttachments).where(inArray(waAttachments.broadcastId, found)).run();
    await tx.delete(waBroadcasts).where(inArray(waBroadcasts.id, found)).run();
  });
  return found.length;
}
