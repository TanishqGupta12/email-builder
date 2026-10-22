import { randomUUID } from "crypto";
import { access, readFile } from "fs/promises";
import path from "path";

const MAX_BYTES = 10 * 1024 * 1024;

/** Marker path when file bytes live in the DB (Turso / local SQLite). */
export const DB_ATTACHMENT_PATH = "db";

/** Legacy local disk root (older campaigns that wrote files to disk). */
export function uploadsRoot(): string {
  return path.join(process.cwd(), "data", "uploads");
}

export type SavedAttachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  contentBase64: string;
};

/**
 * Prepare an attachment for DB storage.
 * Bytes go in Turso so attachments work on Vercel (ephemeral disk).
 */
export async function saveAttachment(
  _campaignId: string,
  file: File,
): Promise<SavedAttachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File "${file.name}" exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;

  return {
    filename,
    originalName: file.name.slice(0, 255),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    path: DB_ATTACHMENT_PATH,
    contentBase64: buf.toString("base64"),
  };
}

/** Ensure the stored path belongs to this campaign under the uploads root. */
export function isSafeAttachmentPath(campaignId: string, filePath: string): boolean {
  if (filePath === DB_ATTACHMENT_PATH) return false;
  const root = path.resolve(uploadsRoot(), campaignId);
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export async function readStoredAttachment(
  campaignId: string,
  filePath: string,
  contentBase64?: string | null,
): Promise<Buffer | null> {
  if (contentBase64) {
    try {
      return Buffer.from(contentBase64, "base64");
    } catch {
      return null;
    }
  }
  if (!isSafeAttachmentPath(campaignId, filePath)) return null;
  try {
    await access(filePath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}
