import {
  mediaKindForMime,
  sendWhatsappTemplate,
  templateBodyParameter,
  uploadWhatsappMedia,
} from "@/lib/whatsapp/cloud-client";
import {
  failAllPendingRecipients,
  getBroadcast,
  getConnectionForSend,
  patchRecipient,
  setBroadcastStatus,
} from "@/lib/whatsapp/store";

const DEFAULT_GAP_MS = 1500;
const activeSends = new Set<string>();

export async function sendWhatsappBroadcast(broadcastId: string) {
  if (activeSends.has(broadcastId)) {
    console.warn("[sendWhatsappBroadcast] already running, skipping duplicate for", broadcastId);
    return;
  }
  activeSends.add(broadcastId);

  try {
    const broadcast = await getBroadcast(broadcastId, { includeContent: true });
    if (!broadcast) return;
    if (broadcast.status !== "QUEUED") {
      console.warn("[sendWhatsappBroadcast] expected QUEUED, got", broadcast.status, broadcastId);
      return;
    }

    await setBroadcastStatus(broadcastId, "SENDING");

    const connection = await getConnectionForSend();
    if (!connection) {
      await failAllPendingRecipients(broadcastId, "WhatsApp connection is not configured.");
      await setBroadcastStatus(broadcastId, "COMPLETED");
      return;
    }

    const bodyText = templateBodyParameter(broadcast.message);
    if (connection.bodyVariable && !bodyText) {
      await failAllPendingRecipients(broadcastId, "Message is empty after WhatsApp formatting.");
      await setBroadcastStatus(broadcastId, "COMPLETED");
      return;
    }

    const creds = {
      phoneNumberId: connection.phoneNumberId,
      accessToken: connection.accessToken,
      templateName: connection.templateName,
      templateLanguage: connection.templateLanguage,
    };

    let media: { id: string; kind: ReturnType<typeof mediaKindForMime>; filename: string } | undefined;
    const attachment = broadcast.attachments[0];
    if (attachment?.contentBase64) {
      try {
        const bytes = Buffer.from(attachment.contentBase64, "base64");
        const id = await uploadWhatsappMedia(creds, {
          filename: attachment.originalName,
          mimeType: attachment.mimeType,
          bytes,
        });
        media = {
          id,
          kind: mediaKindForMime(attachment.mimeType),
          filename: attachment.originalName,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await failAllPendingRecipients(broadcastId, message);
        await setBroadcastStatus(broadcastId, "COMPLETED");
        return;
      }
    }

    const betweenMs = broadcast.delayMs > 0 ? broadcast.delayMs : DEFAULT_GAP_MS;
    const { recipients } = broadcast;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      if (recipient.status !== "PENDING") continue;

      try {
        await sendWhatsappTemplate(creds, {
          to: recipient.phone,
          bodyText,
          includeBodyVariable: connection.bodyVariable,
          media,
        });
        await patchRecipient(broadcastId, recipient.id, {
          status: "SENT",
          sentAt: new Date(),
          errorMessage: null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const errorMessage = message.slice(0, 500);
        console.error("[sendWhatsappBroadcast] failed", broadcastId, recipient.phone, errorMessage);
        await patchRecipient(broadcastId, recipient.id, {
          status: "FAILED",
          errorMessage,
        });
      }

      const morePendingLater = recipients.some((item, idx) => idx > i && item.status === "PENDING");
      if (morePendingLater && betweenMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, betweenMs));
      }
    }

    await setBroadcastStatus(broadcastId, "COMPLETED");
  } finally {
    activeSends.delete(broadcastId);
  }
}
