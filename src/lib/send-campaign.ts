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

/** Campaigns the user asked to stop; checked between each recipient. */
const cancelledSends = new Set<string>();

function delayBetweenMs(campaign: {
  sendMode: string;
  delayMs: number;
}): number {
  if (campaign.sendMode === "delayed" && campaign.delayMs > 0) {
    return campaign.delayMs;
  }
  return DEFAULT_GAP_MS;
}

function sleep(ms: number, campaignId: string): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (cancelledSends.has(campaignId) || Date.now() - started >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(200, ms));
    };
    tick();
  });
}

export function isCampaignSendCancelled(campaignId: string): boolean {
  return cancelledSends.has(campaignId);
}

/** Mark a live send to stop after the current email. Pending recipients are failed. */
export async function cancelCampaignSend(campaignId: string): Promise<
  { ok: true; cancelledPending: number } | { ok: false; error: string }
> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  if (campaign.status === "COMPLETED") {
    return { ok: true, cancelledPending: 0 };
  }
  if (campaign.status !== "QUEUED" && campaign.status !== "SENDING") {
    return { ok: false, error: "This campaign is not sending." };
  }

  cancelledSends.add(campaignId);
  const pending = campaign.recipients.filter((r) => r.status === "PENDING").length;
  await failAllPendingRecipients(campaignId, "Cancelled by user");
  await setCampaignStatus(campaignId, "COMPLETED");
  return { ok: true, cancelledPending: pending };
}

export async function sendCampaignEmails(
  campaignId: string,
  opts: { allowSending?: boolean } = {},
) {
  if (activeSends.has(campaignId)) {
    console.warn("[sendCampaignEmails] already running, skipping duplicate for", campaignId);
    return;
  }
  if (cancelledSends.has(campaignId)) {
    cancelledSends.delete(campaignId);
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

    async function shouldStop(): Promise<boolean> {
      if (cancelledSends.has(campaignId)) return true;
      const latest = await getCampaign(campaignId);
      if (!latest || latest.status === "COMPLETED") return true;
      return false;
    }

    for (let i = 0; i < recipients.length; i++) {
      if (await shouldStop()) break;

      const recipient = recipients[i];
      if (recipient.status !== "PENDING") continue;

      // Skip if cancel API already failed this row in the database.
      const latestBefore = await getCampaign(campaignId);
      const live = latestBefore?.recipients.find((r) => r.id === recipient.id);
      if (!live || live.status !== "PENDING") continue;

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
        if (await shouldStop()) break;
        const message = err instanceof Error ? err.message : String(err);
        await patchRecipient(campaignId, recipient.id, {
          status: "FAILED",
          errorMessage: message,
        });
      }

      if (await shouldStop()) break;

      const morePendingLater = recipients.some(
        (r, idx) => idx > i && r.status === "PENDING",
      );
      if (morePendingLater && betweenMs > 0) {
        await sleep(betweenMs, campaignId);
      }
    }

    if (cancelledSends.has(campaignId)) {
      await failAllPendingRecipients(campaignId, "Cancelled by user");
    }
    const final = await getCampaign(campaignId);
    if (final && final.status !== "COMPLETED") {
      await setCampaignStatus(campaignId, "COMPLETED");
    }
  } finally {
    activeSends.delete(campaignId);
    cancelledSends.delete(campaignId);
  }
}
