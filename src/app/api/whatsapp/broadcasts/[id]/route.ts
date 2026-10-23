import { NextResponse } from "next/server";
import { deleteBroadcasts, getBroadcast } from "@/lib/whatsapp/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;
  const broadcast = await getBroadcast(id, { includeContent: false });
  if (!broadcast) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

export async function DELETE(_req: Request, context: Params) {
  const { id } = await context.params;
  const deleted = await deleteBroadcasts([id]);
  if (deleted === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: 1, id });
}
