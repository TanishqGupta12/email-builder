import { after } from "next/server";
import { NextResponse } from "next/server";
import { sendWhatsappBroadcast } from "@/lib/whatsapp/send-broadcast";
import { prepareBroadcastRetry } from "@/lib/whatsapp/store";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Params) {
  const { id } = await context.params;
  const prepared = await prepareBroadcastRetry(id);
  if (!prepared.ok) {
    const status = prepared.error === "Broadcast not found." ? 404 : 400;
    return NextResponse.json({ error: prepared.error }, { status });
  }

  after(async () => {
    try {
      await sendWhatsappBroadcast(id);
    } catch (err) {
      console.error("sendWhatsappBroadcast retry", id, err);
    }
  });

  return NextResponse.json({
    id,
    message: prepared.message,
    pendingCount: prepared.pendingCount,
    status: "QUEUED",
  });
}
