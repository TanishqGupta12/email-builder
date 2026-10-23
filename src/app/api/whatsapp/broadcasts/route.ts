import { after } from "next/server";
import { NextResponse } from "next/server";
import { parsePageParams } from "@/lib/pagination";
import { templateBodyParameter } from "@/lib/whatsapp/cloud-client";
import {
  extractPhonesFromCsvStats,
  mergePhoneStats,
  parsePhonePasteStats,
} from "@/lib/whatsapp/phones";
import { sendWhatsappBroadcast } from "@/lib/whatsapp/send-broadcast";
import {
  addBroadcastAttachment,
  createBroadcast,
  deleteBroadcasts,
  failAllPendingRecipients,
  listBroadcastsPage,
  setBroadcastStatus,
} from "@/lib/whatsapp/store";
import { saveWhatsappAttachment } from "@/lib/whatsapp/uploads";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { page, pageSize } = parsePageParams(url.searchParams, { page: 1, pageSize: 10 });
  const q = url.searchParams.get("q")?.trim() || undefined;
  const result = await listBroadcastsPage(page, pageSize, q);
  return NextResponse.json({
    broadcasts: result.items,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}

export async function DELETE(req: Request) {
  let body: { ids?: unknown } = {};
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide ids to delete." }, { status: 400 });
  }
  const deleted = await deleteBroadcasts(ids);
  return NextResponse.json({ deleted, ids });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const message = String(form.get("message") ?? "");
  const numbersText = String(form.get("numbersText") ?? "");
  const delaySeconds = Number(form.get("delaySeconds") ?? 1.5);
  const csvFile = form.get("csvFile");

  const prepared = templateBodyParameter(message);
  if (!prepared) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (prepared.length > 1024) {
    return NextResponse.json(
      { error: "Message must be 1024 characters or fewer for a WhatsApp template." },
      { status: 400 },
    );
  }

  const csvStats =
    csvFile instanceof File && csvFile.size > 0
      ? extractPhonesFromCsvStats(await csvFile.text())
      : { values: [], duplicateCount: 0 };
  const { valid, invalid, duplicateCount } = mergePhoneStats([
    parsePhonePasteStats(numbersText),
    csvStats,
  ]);

  if (valid.length === 0) {
    return NextResponse.json(
      {
        error: "Add at least one WhatsApp number with a country code.",
        invalid,
      },
      { status: 400 },
    );
  }

  const files = form
    .getAll("attachment")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > 1) {
    return NextResponse.json(
      { error: "WhatsApp templates can include one attachment." },
      { status: 400 },
    );
  }

  const delayMs =
    Number.isFinite(delaySeconds) && delaySeconds > 0 ? Math.round(delaySeconds * 1000) : 1500;

  const broadcast = await createBroadcast({
    message: message.trim(),
    delayMs,
    validPhones: valid,
    invalidNumbers: invalid.length ? invalid : null,
  });

  try {
    if (files[0]) {
      const saved = await saveWhatsappAttachment(files[0]);
      await addBroadcastAttachment(broadcast.id, saved);
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    await failAllPendingRecipients(broadcast.id, error);
    await setBroadcastStatus(broadcast.id, "COMPLETED");
    return NextResponse.json({ error, id: broadcast.id }, { status: 400 });
  }

  after(async () => {
    try {
      await sendWhatsappBroadcast(broadcast.id);
    } catch (err) {
      console.error("sendWhatsappBroadcast", broadcast.id, err);
    }
  });

  return NextResponse.json({
    id: broadcast.id,
    invalidCount: invalid.length,
    invalid,
    duplicateCount,
    recipientCount: valid.length,
  });
}
