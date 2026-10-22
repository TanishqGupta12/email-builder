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
  path TEXT NOT NULL
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
  return drizzle(client, { schema });
}

export function getDb(): Promise<AppDatabase> {
  if (!globalForDb.__emailBuilderDb) {
    globalForDb.__emailBuilderDb = openDatabase().catch((error: unknown) => {
      globalForDb.__emailBuilderDb = undefined;
      throw error;
    });
  }
  return globalForDb.__emailBuilderDb;
}
