import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;

  const campaign = getCampaign(id);

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}
