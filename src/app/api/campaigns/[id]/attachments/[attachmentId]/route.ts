import { NextResponse } from "next/server";
import { getCampaign } from "@/lib/campaign-store";
import { readStoredAttachment } from "@/lib/uploads";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: Request, context: Params) {
  const { id, attachmentId } = await context.params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = campaign.attachments.find((a) => a.id === attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const buf = await readStoredAttachment(id, attachment.path);
  if (!buf) {
    return NextResponse.json(
      { error: "Attachment file is no longer available on disk." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.originalName.replace(/"/g, "")}"`,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, max-age=60",
    },
  });
}
