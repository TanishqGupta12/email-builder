import {
  failAllPendingRecipients,
  getCampaign,
  patchRecipient,
  setCampaignStatus,
} from "@/lib/campaign-store";
import { getTransporter } from "@/lib/smtp";
import { readStoredAttachment } from "@/lib/uploads";
import type { Transporter } from "nodemailer";

/** Space between messages when not using custom delay (keeps SMTP strictly one-by-one). */
const DEFAULT_GAP_MS = 400;

/** Prevents duplicate concurrent sends if `after()` or the client fires twice. */
const activeSends = new Set<string>();

function delayBetweenMs(campaign: {
  sendMode: string;
  delayMs: number;
}): number {
  if (campaign.sendMode === "delayed" && campaign.delayMs > 0) {
    return campaign.delayMs;
  }
  return DEFAULT_GAP_MS;
}

export async function sendCampaignEmails(
  campaignId: string,
  opts: { allowSending?: boolean } = {},
) {
  if (activeSends.has(campaignId)) {
    console.warn("[sendCampaignEmails] already running, skipping duplicate for", campaignId);
    return;
  }
  activeSends.add(campaignId);

  try {
    const campaign = await getCampaign(campaignId);

    if (!campaign) return;

    const statusOk =
      campaign.status === "QUEUED" ||
      (opts.allowSending === true && campaign.status === "SENDING");
    if (!statusOk) {
      console.warn("[sendCampaignEmails] expected QUEUED, got", campaign.status, campaignId);
      return;
    }

    if (campaign.status !== "SENDING") {
      await setCampaignStatus(campaignId, "SENDING");
    }

    let transporter: Transporter;
    try {
      transporter = await getTransporter();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await failAllPendingRecipients(campaignId, `SMTP: ${message}`);
      await setCampaignStatus(campaignId, "COMPLETED");
      return;
    }

    const mailAttachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const a of campaign.attachments) {
      const content = await readStoredAttachment(campaignId, a.path, a.contentBase64);
      if (!content) {
        console.warn("[sendCampaignEmails] missing attachment bytes", a.id, a.originalName);
        continue;
      }
      mailAttachments.push({
        filename: a.originalName,
        content,
        contentType: a.mimeType,
      });
    }

    const betweenMs = delayBetweenMs(campaign);
    const { recipients } = campaign;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (recipient.status !== "PENDING") continue;

      try {
        await transporter.sendMail({
          from: campaign.senderEmail,
          to: recipient.email,
          subject: campaign.subject,
          html: campaign.bodyHtml,
          attachments: mailAttachments.length ? mailAttachments : undefined,
        });

        await patchRecipient(campaignId, recipient.id, {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await patchRecipient(campaignId, recipient.id, {
          status: "FAILED",
          errorMessage: message,
        });
      }

      const morePendingLater = recipients.some(
        (r, idx) => idx > i && r.status === "PENDING",
      );
      if (morePendingLater && betweenMs > 0) {
        await new Promise((r) => setTimeout(r, betweenMs));
      }
    }

    await setCampaignStatus(campaignId, "COMPLETED");
  } finally {
    activeSends.delete(campaignId);
  }
}
