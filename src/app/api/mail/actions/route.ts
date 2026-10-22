import { NextResponse } from "next/server";
import { runMailActions } from "@/lib/mail/service";
import type { MailAction, MailFolderId } from "@/lib/mail/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACTIONS = new Set<MailAction>([
  "star",
  "unstar",
  "important",
  "unimportant",
  "read",
  "unread",
  "archive",
  "spam",
  "unspam",
  "trash",
  "delete",
  "restore",
  "snooze",
]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: MailAction;
      targets?: {
        mailbox?: string;
        uid?: number;
        localId?: string;
        source: "imap" | "local";
      }[];
      snoozeUntil?: string;
      folder?: MailFolderId;
    };

    if (!body.action || !ACTIONS.has(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json({ error: "targets required" }, { status: 400 });
    }

    const result = await runMailActions({
      action: body.action,
      targets: body.targets,
      snoozeUntil: body.snoozeUntil,
      folder: body.folder,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
