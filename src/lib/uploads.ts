import { randomUUID } from "crypto";
import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const MAX_BYTES = 10 * 1024 * 1024;

/** Persistent on local runs; blocked on Vercel (ephemeral disk). */
export function uploadsRoot(): string {
  return path.join(process.cwd(), "data", "uploads");
}

export async function saveAttachment(
  campaignId: string,
  file: File,
): Promise<{
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}> {
  if (process.env.VERCEL) {
    throw new Error(
      "File attachments are not supported on Vercel. Send without attachments, or run locally.",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File "${file.name}" exceeds ${MAX_BYTES / 1024 / 1024}MB limit.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext}`;
  const dir = path.join(uploadsRoot(), campaignId);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, buf);
  return {
    filename,
    originalName: file.name.slice(0, 255),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    path: fullPath,
  };
}

/** Ensure the stored path belongs to this campaign under the uploads root. */
export function isSafeAttachmentPath(campaignId: string, filePath: string): boolean {
  const root = path.resolve(uploadsRoot(), campaignId);
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

export async function readStoredAttachment(
  campaignId: string,
  filePath: string,
): Promise<Buffer | null> {
  if (!isSafeAttachmentPath(campaignId, filePath)) return null;
  try {
    await access(filePath);
    return await readFile(filePath);
  } catch {
    return null;
  }
}
