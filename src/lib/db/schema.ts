import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  senderEmail: text("sender_email").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  sendMode: text("send_mode").notNull(),
  delayMs: integer("delay_ms").notNull(),
  status: text("status").$type<"QUEUED" | "SENDING" | "COMPLETED">().notNull(),
  invalidEmails: text("invalid_emails"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const recipients = sqliteTable("recipients", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  status: text("status").$type<"PENDING" | "SENT" | "FAILED">().notNull(),
  errorMessage: text("error_message"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
});

export const smtpConfigs = sqliteTable("smtp_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").$type<"SMTP">().notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  encryption: text("encryption").$type<"tls" | "ssl" | "none">().notNull(),
  active: integer("active", { mode: "boolean" }).notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
