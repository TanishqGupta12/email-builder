import { randomUUID } from "crypto";
import { asc, count, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { smtpConfigs } from "@/lib/db/schema";

export type SmtpProvider = "SMTP";

export type SmtpEncryption = "tls" | "ssl" | "none";

export type SmtpConfigRecord = {
  id: string;
  name: string;
  provider: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  active: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const globalForSeed = globalThis as unknown as {
  /** True after we attempted a one-time seed from env while the table was empty. */
  __smtpEnvSeedAttempted?: boolean;
};

function encryptionFromPort(port: number): SmtpEncryption {
  if (port === 465) return "ssl";
  return "tls";
}

function toRecord(row: typeof smtpConfigs.$inferSelect): SmtpConfigRecord {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    encryption: row.encryption,
    active: row.active,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** One-time seed from process.env when the table is empty and credentials exist. */
export async function seedSmtpConfigFromEnvIfEmpty(): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ n: count() }).from(smtpConfigs).get();
  if (Number(existing?.n ?? 0) > 0) return;
  if (globalForSeed.__smtpEnvSeedAttempted) return;
  globalForSeed.__smtpEnvSeedAttempted = true;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return;

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587) || 587;
  const t = new Date();
  await db
    .insert(smtpConfigs)
    .values({
      id: randomUUID(),
      name: "Environment (.env)",
      provider: "SMTP",
      host,
      port,
      username: user,
      password: pass,
      encryption: encryptionFromPort(port),
      active: true,
      isDefault: true,
      createdAt: t,
      updatedAt: t,
    })
    .run();
}

export async function listSmtpConfigs(): Promise<
  (Omit<SmtpConfigRecord, "password"> & {
    passwordSet: boolean;
  })[]
> {
  await seedSmtpConfigFromEnvIfEmpty();
  const db = await getDb();
  const rows = await db.select().from(smtpConfigs).orderBy(desc(smtpConfigs.updatedAt)).all();
  return rows.map((row) => {
    const { password, ...rest } = toRecord(row);
    return { ...rest, passwordSet: password.length > 0 };
  });
}

export async function getSmtpConfig(id: string): Promise<SmtpConfigRecord | undefined> {
  await seedSmtpConfigFromEnvIfEmpty();
  const db = await getDb();
  const row = await db.select().from(smtpConfigs).where(eq(smtpConfigs.id, id)).get();
  return row ? toRecord(row) : undefined;
}

export async function createSmtpConfig(input: {
  name: string;
  provider?: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  active: boolean;
  isDefault: boolean;
}): Promise<SmtpConfigRecord> {
  await seedSmtpConfigFromEnvIfEmpty();
  const id = randomUUID();
  const t = new Date();
  const rec: SmtpConfigRecord = {
    id,
    name: input.name.trim() || "SMTP configuration",
    provider: input.provider ?? "SMTP",
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    password: input.password,
    encryption: input.encryption,
    active: input.active,
    isDefault: input.isDefault,
    createdAt: t,
    updatedAt: t,
  };

  const db = await getDb();
  await db.transaction(async (tx) => {
    if (rec.isDefault) {
      await tx.update(smtpConfigs).set({ isDefault: false }).where(ne(smtpConfigs.id, id)).run();
    }
    await tx.insert(smtpConfigs).values(rec).run();
  });
  return rec;
}

export async function updateSmtpConfig(
  id: string,
  patch: Partial<{
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    encryption: SmtpEncryption;
    active: boolean;
    isDefault: boolean;
    clearPassword: boolean;
  }>,
): Promise<SmtpConfigRecord | undefined> {
  await seedSmtpConfigFromEnvIfEmpty();
  const db = await getDb();
  const current = await db.select().from(smtpConfigs).where(eq(smtpConfigs.id, id)).get();
  if (!current) return undefined;

  const next = toRecord(current);
  if (patch.name !== undefined) next.name = patch.name.trim() || next.name;
  if (patch.host !== undefined) next.host = patch.host.trim();
  if (patch.port !== undefined) next.port = patch.port;
  if (patch.username !== undefined) next.username = patch.username.trim();
  if (patch.encryption !== undefined) next.encryption = patch.encryption;
  if (patch.active !== undefined) next.active = patch.active;
  if (patch.isDefault !== undefined) next.isDefault = patch.isDefault;
  if (patch.clearPassword === true) next.password = "";
  if (patch.password !== undefined && patch.password.length > 0) {
    next.password = patch.password;
  }
  next.updatedAt = new Date();

  await db.transaction(async (tx) => {
    if (next.isDefault) {
      await tx.update(smtpConfigs).set({ isDefault: false }).where(ne(smtpConfigs.id, id)).run();
    }
    await tx.update(smtpConfigs).set(next).where(eq(smtpConfigs.id, id)).run();
  });
  return next;
}

export async function deleteSmtpConfig(id: string): Promise<boolean> {
  await seedSmtpConfigFromEnvIfEmpty();
  const db = await getDb();
  return db.transaction(async (tx) => {
    const current = await tx.select().from(smtpConfigs).where(eq(smtpConfigs.id, id)).get();
    if (!current) return false;
    await tx.delete(smtpConfigs).where(eq(smtpConfigs.id, id)).run();
    if (current.isDefault) {
      const first = await tx.select().from(smtpConfigs).orderBy(desc(smtpConfigs.updatedAt)).get();
      if (first) {
        await tx
          .update(smtpConfigs)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(smtpConfigs.id, first.id))
          .run();
      }
    }
    return true;
  });
}

/** Active config used for sending: default among active, else earliest active. */
export async function getActiveSmtpConfigForSend(): Promise<SmtpConfigRecord | null> {
  await seedSmtpConfigFromEnvIfEmpty();
  const db = await getDb();
  const all = (
    await db
      .select()
      .from(smtpConfigs)
      .where(eq(smtpConfigs.active, true))
      .orderBy(asc(smtpConfigs.createdAt))
      .all()
  ).map(toRecord);
  if (all.length === 0) return null;
  return all.find((config) => config.isDefault) ?? all[0];
}
