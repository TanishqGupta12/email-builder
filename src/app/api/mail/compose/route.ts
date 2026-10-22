import { NextResponse } from "next/server";
import { composeMail, rescheduleMail, saveDraftMail } from "@/lib/mail/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: "send" | "draft" | "schedule" | "reschedule";
      to?: string;
      cc?: string;
      subject?: string;
      bodyHtml?: string;
      sendAt?: string;
      draftId?: string;
      scheduledId?: string;
    };

    const mode = body.mode || "send";

    if (mode === "draft") {
      const saved = await saveDraftMail({
        to: body.to || "",
        cc: body.cc,
        subject: body.subject || "",
        bodyHtml: body.bodyHtml || "<p></p>",
        draftId: body.draftId,
      });
      return NextResponse.json({ ok: true, ...saved, mode: "draft" });
    }

    if (mode === "reschedule") {
      if (!body.scheduledId || !body.sendAt) {
        return NextResponse.json(
          { error: "scheduledId and sendAt required" },
          { status: 400 },
        );
      }
      await rescheduleMail(body.scheduledId, body.sendAt);
      return NextResponse.json({ ok: true, mode: "reschedule" });
    }

    const result = await composeMail({
      to: body.to || "",
      cc: body.cc,
      subject: body.subject || "",
      bodyHtml: body.bodyHtml || "<p></p>",
      sendAt: mode === "schedule" ? body.sendAt : null,
      draftId: body.draftId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
