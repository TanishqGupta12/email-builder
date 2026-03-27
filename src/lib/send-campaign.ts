import {
  failAllPendingRecipients,
  getCampaign,
  patchRecipient,
  setCampaignStatus,
} from "@/lib/campaign-store";
import { getTransporter } from "@/lib/smtp";

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

export async function sendCampaignEmails(campaignId: string) {
  if (activeSends.has(campaignId)) {
    console.warn("[sendCampaignEmails] already running, skipping duplicate for", campaignId);
    return;
  }
  activeSends.add(campaignId);

  try {
    const campaign = getCampaign(campaignId);

    if (!campaign) return;

    if (campaign.status !== "QUEUED") {
      console.warn("[sendCampaignEmails] expected QUEUED, got", campaign.status, campaignId);
      return;
    }

    setCampaignStatus(campaignId, "SENDING");

    let transporter: ReturnType<typeof getTransporter>;
    try {
      transporter = getTransporter();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      failAllPendingRecipients(campaignId, `SMTP: ${message}`);
      setCampaignStatus(campaignId, "COMPLETED");
      return;
    }

    const mailAttachments = campaign.attachments.map((a) => ({
      filename: a.originalName,
      path: a.path,
    }));

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

        patchRecipient(campaignId, recipient.id, {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        patchRecipient(campaignId, recipient.id, {
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

    setCampaignStatus(campaignId, "COMPLETED");
  } finally {
    activeSends.delete(campaignId);
  }
}
