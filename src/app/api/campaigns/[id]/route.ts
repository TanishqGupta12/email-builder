import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;

  const campaign = await getCampaign(id, { includeContent: false });

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    campaign: {
      ...campaign,
      attachments: campaign.attachments.map(
        ({ path: _path, contentBase64: _content, ...rest }) => rest,
      ),
    },
  });
}
