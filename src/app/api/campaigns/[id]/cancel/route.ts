import { NextResponse } from "next/server";
import { cancelCampaignSend } from "@/lib/send-campaign";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Params) {
  const { id } = await context.params;
  const result = await cancelCampaignSend(id);
  if (!result.ok) {
    const status = result.error === "Campaign not found." ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    id,
    status: "COMPLETED",
    cancelledPending: result.cancelledPending,
  });
}
