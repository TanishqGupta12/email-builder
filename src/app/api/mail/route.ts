import { NextResponse } from "next/server";
import { filtersFromRequest } from "@/lib/mail/search";
import { listMail } from "@/lib/mail/service";
import type { MailFolderId, MailSort } from "@/lib/mail/types";
import { parsePageParams } from "@/lib/pagination";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLDERS = new Set<MailFolderId>([
  "inbox",
  "all",
  "sent",
  "drafts",
  "spam",
  "trash",
  "scheduled",
  "important",
  "starred",
  "snoozed",
  "social",
  "promotions",
  "forums",
  "updates",
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const folderRaw = (url.searchParams.get("folder") || "inbox") as MailFolderId;
    const folder = FOLDERS.has(folderRaw) ? folderRaw : "inbox";
    const { page, pageSize } = parsePageParams(url.searchParams, {
      page: 1,
      pageSize: 20,
    });
    const sort = (url.searchParams.get("sort") || "date_desc") as MailSort;
    const filters = filtersFromRequest(url.searchParams);

    const result = await listMail({
      folder,
      page,
      pageSize,
      sort,
      filters,
    });

    return NextResponse.json({
      messages: result.items,
      mailbox: result.mailbox,
      accountEmail: result.accountEmail,
      folder,
      searchSummary: result.searchSummary ?? null,
      filters,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
