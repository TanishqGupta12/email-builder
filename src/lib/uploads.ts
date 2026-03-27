import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

const MAX_BYTES = 10 * 1024 * 1024;

/** Writable on serverless (e.g. Vercel). `process.cwd()` under `/var/task` is read-only there. */
function uploadsRoot(): string {
  return path.join(os.tmpdir(), "email-builder-uploads");
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
