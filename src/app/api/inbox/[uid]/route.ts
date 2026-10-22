import { NextResponse } from "next/server";
import { deleteInboxMessages, getInboxMessage } from "@/lib/inbox";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ uid: string }> };

export async function GET(_req: Request, context: Params) {
  const { uid: raw } = await context.params;
  const uid = Number(raw);
  if (!Number.isFinite(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid message id." }, { status: 400 });
  }

  try {
    const message = await getInboxMessage(uid);
    if (!message) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    return NextResponse.json({ message });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(_req: Request, context: Params) {
  const { uid: raw } = await context.params;
  const uid = Number(raw);
  if (!Number.isFinite(uid) || uid <= 0) {
    return NextResponse.json({ error: "Invalid message id." }, { status: 400 });
  }

  try {
    const deleted = await deleteInboxMessages([uid]);
    if (deleted === 0) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    return NextResponse.json({ deleted: 1, uid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
