import { NextResponse } from "next/server";
import { deleteCampaigns, getCampaign } from "@/lib/campaign-store";

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

export async function DELETE(_req: Request, context: Params) {
  const { id } = await context.params;
  const deleted = await deleteCampaigns([id]);
  if (deleted === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: 1, id });
}
