import { randomUUID } from "crypto";
import path from "path";

const MAX_BYTES = 10 * 1024 * 1024;

/** Marker path when file bytes live in the database. */
export const DB_ATTACHMENT_PATH = "db";

export type SavedWhatsappAttachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  contentBase64: string;
};

export async function saveWhatsappAttachment(file: File): Promise<SavedWhatsappAttachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File "${file.name}" exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  return {
    filename: `${randomUUID()}${ext}`,
    originalName: file.name.slice(0, 255),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    path: DB_ATTACHMENT_PATH,
    contentBase64: buf.toString("base64"),
  };
}
