import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  addCampaignAttachment,
  createCampaign,
  deleteAllCampaigns,
  deleteCampaigns,
  failAllPendingRecipients,
  listCampaignsPage,
  setCampaignStatus,
} from "@/lib/campaign-store";
import { parsePageParams } from "@/lib/pagination";
import {
  extractEmailsFromCsvStats,
  mergeRecipientStats,
  parseEmailPasteStats,
} from "@/lib/recipients";
import { sendCampaignEmails } from "@/lib/send-campaign";
import { saveAttachment } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 300;

function countByStatus(
  rows: { status: string }[],
): { sent: number; failed: number; pending: number } {
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const r of rows) {
    if (r.status === "SENT") sent++;
    else if (r.status === "FAILED") failed++;
    else pending++;
  }
  return { sent, failed, pending };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { page, pageSize } = parsePageParams(url.searchParams, {
    page: 1,
    pageSize: 10,
  });
  const q = url.searchParams.get("q")?.trim() || undefined;
  const result = await listCampaignsPage(page, pageSize, q);

  const payload = result.items.map((c) => ({
    id: c.id,
    senderEmail: c.senderEmail,
    subject: c.subject,
    sendMode: c.sendMode,
    delayMs: c.delayMs,
    status: c.status,
    createdAt: c.createdAt,
    invalidEmails: c.invalidEmails,
    attachments: c.attachments.map((a) => ({
      id: a.id,
      originalName: a.originalName,
      size: a.size,
    })),
    ...countByStatus(c.recipients),
  }));

  return NextResponse.json({
    campaigns: payload,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}

/** Permanently delete selected campaigns, or all campaigns when `{ all: true }`. */
export async function DELETE(req: Request) {
  let body: { ids?: unknown; all?: unknown } = {};
  try {
    body = (await req.json()) as { ids?: unknown; all?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.all === true) {
    const deleted = await deleteAllCampaigns();
    return NextResponse.json({ deleted, all: true });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Provide ids to delete, or set all: true." },
      { status: 400 },
    );
  }

  const deleted = await deleteCampaigns(ids);
  return NextResponse.json({ deleted, ids });
}

export async function POST(req: Request) {
  const form = await req.formData();

  const senderEmail = String(form.get("senderEmail") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const bodyHtml = String(form.get("bodyHtml") ?? "");
  const recipientsText = String(form.get("recipientsText") ?? "");
  const sendModeRaw = String(form.get("sendMode") ?? "instant");
  const sendMode = sendModeRaw === "delayed" ? "delayed" : "instant";
  const delaySeconds = Number(form.get("delaySeconds") ?? 0);

  const csvFile = form.get("csvFile");
  const csvStats =
    csvFile instanceof File && csvFile.size > 0
      ? extractEmailsFromCsvStats(await csvFile.text())
      : { emails: [], duplicateCount: 0 };

  const { valid, invalid, duplicateCount } = mergeRecipientStats([
    parseEmailPasteStats(recipientsText),
    csvStats,
  ]);

  if (!senderEmail || !subject || !bodyHtml.replace(/<[^>]*>/g, "").trim()) {
    return NextResponse.json(
      { error: "Sender email, subject, and message are required." },
      { status: 400 },
    );
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { error: "Add at least one valid recipient email.", invalid },
      { status: 400 },
    );
  }

  const delayMs =
    sendMode === "delayed" && delaySeconds > 0 ? Math.round(delaySeconds * 1000) : 0;

  const campaign = await createCampaign({
    senderEmail,
    subject,
    bodyHtml,
    sendMode,
    delayMs,
    validEmails: valid,
    invalidEmails: invalid.length ? invalid : null,
  });

  const attachmentFiles = form.getAll("attachments");
  try {
    for (const item of attachmentFiles) {
      if (!(item instanceof File) || item.size === 0) continue;
      const saved = await saveAttachment(campaign.id, item);
      await addCampaignAttachment(campaign.id, saved);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Avoid leaving the campaign stuck in QUEUED with no send scheduled.
    await failAllPendingRecipients(campaign.id, message);
    await setCampaignStatus(campaign.id, "COMPLETED");
    return NextResponse.json({ error: message, id: campaign.id }, { status: 400 });
  }

  after(async () => {
    try {
      await sendCampaignEmails(campaign.id);
    } catch (e) {
      console.error("sendCampaignEmails", campaign.id, e);
    }
  });

  return NextResponse.json({
    id: campaign.id,
    invalidCount: invalid.length,
    invalid,
    duplicateCount,
    recipientCount: valid.length,
  });
}
