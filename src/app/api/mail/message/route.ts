import { NextResponse } from "next/server";
import { getLocalMailMessage, getMailMessage } from "@/lib/mail/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") || "imap";
    if (source === "local") {
      const folder = url.searchParams.get("folder") as "drafts" | "scheduled" | "snoozed";
      const id = url.searchParams.get("id");
      if (!folder || !id) {
        return NextResponse.json({ error: "folder and id required" }, { status: 400 });
      }
      const message = await getLocalMailMessage(folder, id);
      if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ message });
    }

    const mailbox = url.searchParams.get("mailbox");
    const uid = Number(url.searchParams.get("uid"));
    if (!mailbox || !Number.isFinite(uid)) {
      return NextResponse.json({ error: "mailbox and uid required" }, { status: 400 });
    }
    const message = await getMailMessage(mailbox, uid);
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
