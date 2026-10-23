import { NextResponse } from "next/server";
import {
  deleteAllRecipients,
  deleteRecipientsByEmails,
  listRecipientsPage,
} from "@/lib/campaign-store";
import { parsePageParams } from "@/lib/pagination";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { page, pageSize } = parsePageParams(url.searchParams, {
    page: 1,
    pageSize: 10,
  });
  const q = url.searchParams.get("q")?.trim() || undefined;
  const statusRaw = url.searchParams.get("status") || "all";
  const status =
    statusRaw === "sent" || statusRaw === "pending" || statusRaw === "failed"
      ? statusRaw
      : "all";
  const result = await listRecipientsPage(page, pageSize, q, status);

  return NextResponse.json({
    recipients: result.items.map((r) => ({
      email: r.email,
      sentCount: r.sentCount,
      failedCount: r.failedCount,
      pendingCount: r.pendingCount,
      campaignCount: r.campaignCount,
      lastActivityAt: r.lastActivityAt,
      recentCampaigns: r.recentCampaigns.map((c) => ({
        campaignId: c.campaignId,
        subject: c.subject,
        campaignStatus: c.campaignStatus,
        recipientStatus: c.recipientStatus,
        senderEmail: c.senderEmail,
        createdAt: c.createdAt,
        errorMessage: c.errorMessage,
      })),
    })),
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
    statusCounts: result.statusCounts,
  });
}

/** Permanently delete recipient rows for selected emails, or all recipients. */
export async function DELETE(req: Request) {
  let body: { emails?: unknown; all?: unknown } = {};
  try {
    body = (await req.json()) as { emails?: unknown; all?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.all === true) {
    const deleted = await deleteAllRecipients();
    return NextResponse.json({ deleted, all: true });
  }

  const emails = Array.isArray(body.emails)
    ? body.emails.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
    : [];
  if (emails.length === 0) {
    return NextResponse.json(
      { error: "Provide emails to delete, or set all: true." },
      { status: 400 },
    );
  }

  const deleted = await deleteRecipientsByEmails(emails);
  return NextResponse.json({ deleted, emails });
}
