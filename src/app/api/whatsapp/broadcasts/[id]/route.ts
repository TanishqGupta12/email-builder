import { NextResponse } from "next/server";
import { templateBodyParameter } from "@/lib/whatsapp/cloud-client";
import { sendWhatsappBroadcast } from "@/lib/whatsapp/send-broadcast";
import { deleteBroadcasts, getBroadcast, updateBroadcastMessage } from "@/lib/whatsapp/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;
  const broadcast = await getBroadcast(id, { includeContent: false });
  if (!broadcast) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (broadcast.status === "QUEUED") {
    void sendWhatsappBroadcast(id).catch((err) => {
      console.error("sendWhatsappBroadcast resume", id, err);
    });
  }

  return NextResponse.json({
    broadcast: {
      ...broadcast,
      attachments: broadcast.attachments.map(
        ({ path: _path, contentBase64: _content, ...rest }) => rest,
      ),
    },
  });
}

export async function PATCH(req: Request, context: Params) {
  const { id } = await context.params;
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const prepared = templateBodyParameter(message);
  if (!prepared) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (prepared.length > 1024) {
    return NextResponse.json(
      { error: "Message must be 1024 characters or fewer for a WhatsApp template." },
      { status: 400 },
    );
  }
  try {
    await updateBroadcastMessage(id, message);
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const status = error === "Broadcast not found." ? 404 : 400;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ id, message });
}

export async function DELETE(_req: Request, context: Params) {
  const { id } = await context.params;
  const deleted = await deleteBroadcasts([id]);
  if (deleted === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: 1, id });
}
