import { after } from "next/server";
import { NextResponse } from "next/server";
import { prepareCampaignRetry } from "@/lib/campaign-store";
import { sendCampaignEmails } from "@/lib/send-campaign";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Params) {
  const { id } = await context.params;
  let includeFailed = true;
  try {
    const body = (await req.json()) as { includeFailed?: boolean };
    if (typeof body.includeFailed === "boolean") includeFailed = body.includeFailed;
  } catch {
    /* empty body is fine */
  }

  const prepared = await prepareCampaignRetry(id, { includeFailed });
  if (!prepared.ok) {
    const status = prepared.error === "Campaign not found." ? 404 : 400;
    return NextResponse.json({ error: prepared.error }, { status });
  }

  after(async () => {
    try {
      await sendCampaignEmails(id);
    } catch (e) {
      console.error("sendCampaignEmails retry", id, e);
    }
  });

  return NextResponse.json({
    id,
    pendingCount: prepared.pendingCount,
    status: "QUEUED",
  });
}
