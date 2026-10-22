import { NextResponse } from "next/server";
import {
  deleteInboxMessages,
  listInboxMessages,
  setInboxMessageSeen,
} from "@/lib/inbox";
import { parsePageParams } from "@/lib/pagination";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { page, pageSize } = parsePageParams(new URL(req.url).searchParams, {
      page: 1,
      pageSize: 10,
    });
    const result = await listInboxMessages(page, pageSize);
    return NextResponse.json({
      messages: result.items,
      mailbox: result.mailbox,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { uids?: unknown; seen?: unknown };
    const uids = Array.isArray(body.uids)
      ? body.uids.filter((u): u is number => typeof u === "number" && Number.isFinite(u))
      : [];
    if (uids.length === 0 || typeof body.seen !== "boolean") {
      return NextResponse.json(
        { error: "Provide uids (number[]) and seen (boolean)." },
        { status: 400 },
      );
    }
    const updated = await setInboxMessageSeen(uids, body.seen);
    return NextResponse.json({ updated, seen: body.seen });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { uids?: unknown };
    const uids = Array.isArray(body.uids)
      ? body.uids.filter((u): u is number => typeof u === "number" && Number.isFinite(u))
      : [];
    if (uids.length === 0) {
      return NextResponse.json({ error: "Provide uids to delete." }, { status: 400 });
    }
    const deleted = await deleteInboxMessages(uids);
    return NextResponse.json({ deleted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
