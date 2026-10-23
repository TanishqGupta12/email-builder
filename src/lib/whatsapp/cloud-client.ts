const GRAPH_BASE = "https://graph.facebook.com/v21.0";

export type WaCredentials = {
  phoneNumberId: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
};

export type WaMediaKind = "image" | "video" | "document";

export function mediaKindForMime(mime: string): WaMediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

/** WhatsApp template variables cannot contain line breaks or long space runs. */
export function templateBodyParameter(message: string): string {
  return message.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
}

async function graphError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  } catch {
    /* response was not JSON */
  }
  return text.slice(0, 300) || `WhatsApp API returned ${res.status}`;
}

export async function uploadWhatsappMedia(
  creds: WaCredentials,
  file: { filename: string; mimeType: string; bytes: Buffer },
): Promise<string> {
  const body = new FormData();
  body.append("messaging_product", "whatsapp");
  body.append("type", file.mimeType);
  body.append(
    "file",
    new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
    file.filename,
  );
  const res = await fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(await graphError(res));
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("WhatsApp did not return a media id.");
  return data.id;
}

export async function sendWhatsappTemplate(
  creds: WaCredentials,
  input: {
    to: string;
    bodyText: string;
    media?: { id: string; kind: WaMediaKind; filename: string };
  },
): Promise<void> {
  const components: Record<string, unknown>[] = [];
  if (input.media) {
    const media = input.media;
    const parameter =
      media.kind === "image"
        ? { type: "image", image: { id: media.id } }
        : media.kind === "video"
          ? { type: "video", video: { id: media.id } }
          : { type: "document", document: { id: media.id, filename: media.filename } };
    components.push({ type: "header", parameters: [parameter] });
  }
  components.push({
    type: "body",
    parameters: [{ type: "text", text: input.bodyText }],
  });

  const res = await fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template: {
        name: creds.templateName,
        language: { code: creds.templateLanguage },
        components,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(await graphError(res));
}
