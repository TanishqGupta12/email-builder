import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  addAttachment,
  createCampaign,
  listRecentCampaigns,
} from "@/lib/campaign-store";
import {
  extractEmailsFromCsvText,
  parseEmailPaste,
  partitionEmails,
} from "@/lib/recipients";
import { sendCampaignEmails } from "@/lib/send-campaign";
import { saveAttachment } from "@/lib/uploads";

export const runtime = "nodejs";

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

export async function GET() {
  const campaigns = listRecentCampaigns(25);

  const payload = campaigns.map((c) => ({
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

  return NextResponse.json({ campaigns: payload });
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
  let csvEmails: string[] = [];
  if (csvFile instanceof File && csvFile.size > 0) {
    const text = await csvFile.text();
    csvEmails = extractEmailsFromCsvText(text);
  }

  const pasteEmails = parseEmailPaste(recipientsText);
  const combined = [...new Set([...pasteEmails, ...csvEmails])];
  const { valid, invalid } = partitionEmails(combined);

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

  const campaign = createCampaign({
    senderEmail,
    subject,
    bodyHtml,
    sendMode,
    delayMs,
    validEmails: valid,
    invalidEmails: invalid.length ? invalid : null,
  });

  const attachmentFiles = form.getAll("attachments");
  for (const item of attachmentFiles) {
    if (!(item instanceof File) || item.size === 0) continue;
    const saved = await saveAttachment(campaign.id, item);
    addAttachment(campaign.id, {
      filename: saved.filename,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      size: saved.size,
      path: saved.path,
    });
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
    recipientCount: valid.length,
  });
}
