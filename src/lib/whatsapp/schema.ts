import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const waConnection = sqliteTable("wa_connection", {
  id: text("id").primaryKey(),
  phoneNumberId: text("phone_number_id").notNull(),
  accessToken: text("access_token").notNull(),
  templateName: text("template_name").notNull(),
  templateLanguage: text("template_language").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const waBroadcasts = sqliteTable("wa_broadcasts", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  delayMs: integer("delay_ms").notNull(),
  status: text("status").$type<"QUEUED" | "SENDING" | "COMPLETED">().notNull(),
  invalidNumbers: text("invalid_numbers"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const waRecipients = sqliteTable("wa_recipients", {
  id: text("id").primaryKey(),
  broadcastId: text("broadcast_id")
    .notNull()
    .references(() => waBroadcasts.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  status: text("status").$type<"PENDING" | "SENT" | "FAILED">().notNull(),
  errorMessage: text("error_message"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const waAttachments = sqliteTable("wa_attachments", {
  id: text("id").primaryKey(),
  broadcastId: text("broadcast_id")
    .notNull()
    .references(() => waBroadcasts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  contentBase64: text("content_base64"),
});
