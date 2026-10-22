import { NextResponse } from "next/server";
import {
  checkRecipientsUsedBefore,
  getRecipientUsageTimeline,
} from "@/lib/campaign-store";

export const runtime = "nodejs";

/** Full timeline for one email: GET ?email= */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email")?.trim() || "";
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  try {
    const timeline = await getRecipientUsageTimeline(email);
    return NextResponse.json({
      timeline: {
        ...timeline,
        lastActivityAt: timeline.events[0]
          ? timeline.events[0].sentAt ?? timeline.events[0].createdAt
          : null,
        events: timeline.events.map((e) => ({
          ...e,
          sentAt: e.sentAt,
          createdAt: e.createdAt,
        })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Batch check: POST { emails: string[] } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { emails?: unknown };
    const emails = Array.isArray(body.emails)
      ? body.emails.filter((e): e is string => typeof e === "string")
      : [];
    if (emails.length === 0) {
      return NextResponse.json({ results: [] });
    }
    const results = await checkRecipientsUsedBefore(emails.slice(0, 500));
    return NextResponse.json({
      results: results.map((r) => ({
        ...r,
        lastActivityAt: r.lastActivityAt,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
