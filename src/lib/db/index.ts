import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/lib/db/schema";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  send_mode TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  invalid_emails TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  content_base64 TEXT
);

CREATE TABLE IF NOT EXISTS smtp_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  encryption TEXT NOT NULL,
  active INTEGER NOT NULL,
  is_default INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS recipients_campaign_id_idx ON recipients(campaign_id);
CREATE INDEX IF NOT EXISTS attachments_campaign_id_idx ON attachments(campaign_id);
CREATE INDEX IF NOT EXISTS campaigns_created_at_idx ON campaigns(created_at);

CREATE TABLE IF NOT EXISTS mail_drafts (
  id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  to_addrs TEXT NOT NULL,
  cc_addrs TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_scheduled (
  id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  to_addrs TEXT NOT NULL,
  cc_addrs TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_snoozed (
  id TEXT PRIMARY KEY,
  account_email TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  uid INTEGER NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_email TEXT NOT NULL,
  preview TEXT NOT NULL,
  wake_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mail_drafts_account_idx ON mail_drafts(account_email);
CREATE INDEX IF NOT EXISTS mail_scheduled_account_idx ON mail_scheduled(account_email);
CREATE INDEX IF NOT EXISTS mail_scheduled_send_at_idx ON mail_scheduled(send_at);
CREATE INDEX IF NOT EXISTS mail_snoozed_account_idx ON mail_snoozed(account_email);
CREATE INDEX IF NOT EXISTS mail_snoozed_wake_at_idx ON mail_snoozed(wake_at);

CREATE TABLE IF NOT EXISTS wa_connection (
  id TEXT PRIMARY KEY,
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL,
  body_variable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  invalid_numbers TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_recipients (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES wa_broadcasts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_attachments (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES wa_broadcasts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  content_base64 TEXT
);

CREATE INDEX IF NOT EXISTS wa_recipients_broadcast_id_idx ON wa_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS wa_attachments_broadcast_id_idx ON wa_attachments(broadcast_id);
CREATE INDEX IF NOT EXISTS wa_broadcasts_created_at_idx ON wa_broadcasts(created_at);
`;

export type AppDatabase = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __emailBuilderDb?: Promise<AppDatabase>;
};

function databaseTarget(): { url: string; authToken?: string } {
  const remote = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (remote) {
    if (!remote.startsWith("file:") && !authToken) {
      throw new Error("Set TURSO_AUTH_TOKEN for the hosted Turso database.");
    }
    return { url: remote, authToken: authToken || undefined };
  }

  if (process.env.VERCEL) {
    throw new Error(
      "A local SQLite file does not persist on Vercel. Create a Turso database and set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.",
    );
  }

  const file =
    process.env.EMAIL_BUILDER_DB?.trim() ||
    path.join(process.cwd(), "data", "email-builder.sqlite");
  if (file.startsWith("file:")) return { url: file };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return { url: `file:${path.resolve(file).replace(/\\/g, "/")}` };
}

async function openDatabase(): Promise<AppDatabase> {
  const { url, authToken } = databaseTarget();
  const client = createClient({ url, authToken });
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA foreign_keys = ON");
  }
  await client.executeMultiple(SCHEMA_SQL);
  await ensureAttachmentContentColumn(client);
  return drizzle(client, { schema });
}

async function ensureAttachmentContentColumn(
  client: ReturnType<typeof createClient>,
): Promise<void> {
  const info = await client.execute("PRAGMA table_info(attachments)");
  const hasContent = info.rows.some((row) => {
    const name = (row as { name?: string }).name ?? row[1];
    return name === "content_base64";
  });
  if (!hasContent) {
    await client.execute("ALTER TABLE attachments ADD COLUMN content_base64 TEXT");
  }
}

const globalForWaSchema = globalThis as unknown as {
  __waSchemaReady?: Promise<void>;
};

const globalForWaBody = globalThis as unknown as {
  __waBodyColumn?: Promise<void>;
};

async function ensureWaBodyVariableColumn(db: AppDatabase): Promise<void> {
  if (!globalForWaBody.__waBodyColumn) {
    const client = (db as unknown as { $client: ReturnType<typeof createClient> }).$client;
    globalForWaBody.__waBodyColumn = client
      .execute("PRAGMA table_info(wa_connection)")
      .then(async (info) => {
        const hasColumn = info.rows.some((row) => {
          const name = (row as { name?: string }).name ?? row[1];
          return name === "body_variable";
        });
        if (!hasColumn) {
          await client.execute(
            "ALTER TABLE wa_connection ADD COLUMN body_variable INTEGER NOT NULL DEFAULT 0",
          );
        }
      })
      .catch((error: unknown) => {
        globalForWaBody.__waBodyColumn = undefined;
        throw error;
      });
  }
  await globalForWaBody.__waBodyColumn;
}

async function ensureWhatsappTables(db: AppDatabase): Promise<void> {
  if (!globalForWaSchema.__waSchemaReady) {
    const client = (db as unknown as { $client: ReturnType<typeof createClient> }).$client;
    globalForWaSchema.__waSchemaReady = client
      .executeMultiple(
        `
CREATE TABLE IF NOT EXISTS wa_connection (
  id TEXT PRIMARY KEY,
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL,
  body_variable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  delay_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  invalid_numbers TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_recipients (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES wa_broadcasts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_attachments (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES wa_broadcasts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  content_base64 TEXT
);

CREATE INDEX IF NOT EXISTS wa_recipients_broadcast_id_idx ON wa_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS wa_attachments_broadcast_id_idx ON wa_attachments(broadcast_id);
CREATE INDEX IF NOT EXISTS wa_broadcasts_created_at_idx ON wa_broadcasts(created_at);
`,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        globalForWaSchema.__waSchemaReady = undefined;
        throw error;
      });
  }
  await globalForWaSchema.__waSchemaReady;
}

export function getDb(): Promise<AppDatabase> {
  if (!globalForDb.__emailBuilderDb) {
    globalForDb.__emailBuilderDb = openDatabase().catch((error: unknown) => {
      globalForDb.__emailBuilderDb = undefined;
      throw error;
    });
  }
  return globalForDb.__emailBuilderDb.then(async (db) => {
    await ensureWhatsappTables(db);
    await ensureWaBodyVariableColumn(db);
    return db;
  });
}
