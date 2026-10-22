import type { ImapFlow } from "imapflow";
import type { MailFolderId } from "@/lib/mail/types";

export type ResolvedMailboxes = {
  inbox: string;
  all: string;
  sent: string;
  drafts: string;
  spam: string;
  trash: string;
  starred: string;
  important: string;
};

const cache = new Map<string, ResolvedMailboxes>();

function pickPath(
  boxes: { path: string; specialUse?: string | false; name?: string }[],
  special: string,
  nameHints: string[],
  fallback: string,
): string {
  const bySpecial = boxes.find(
    (b) => typeof b.specialUse === "string" && b.specialUse.toLowerCase() === special.toLowerCase(),
  );
  if (bySpecial) return bySpecial.path;

  const lowerHints = nameHints.map((h) => h.toLowerCase());
  const byName = boxes.find((b) => {
    const p = `${b.path} ${b.name ?? ""}`.toLowerCase();
    return lowerHints.some((h) => p.includes(h));
  });
  if (byName) return byName.path;
  return fallback;
}

export async function resolveMailboxes(client: ImapFlow): Promise<ResolvedMailboxes> {
  const cacheKey = "default";
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const listed = await client.list();
  const boxes = listed.map((b) => ({
    path: b.path,
    specialUse: b.specialUse,
    name: b.name,
  }));

  const resolved: ResolvedMailboxes = {
    inbox: pickPath(boxes, "\\Inbox", ["inbox"], "INBOX"),
    all: pickPath(boxes, "\\All", ["all mail", "all"], "INBOX"),
    sent: pickPath(boxes, "\\Sent", ["sent"], "INBOX"),
    drafts: pickPath(boxes, "\\Drafts", ["draft"], "INBOX"),
    spam: pickPath(boxes, "\\Junk", ["spam", "junk"], "INBOX"),
    trash: pickPath(boxes, "\\Trash", ["trash", "bin", "deleted"], "INBOX"),
    starred: pickPath(boxes, "\\Flagged", ["starred", "flagged"], "INBOX"),
    important: pickPath(boxes, "\\Important", ["important"], "INBOX"),
  };

  cache.set(cacheKey, resolved);
  return resolved;
}

export function folderNeedsLocal(folder: MailFolderId): boolean {
  return folder === "drafts" || folder === "scheduled" || folder === "snoozed";
}

/** Gmail raw search for category views (works on Gmail IMAP). */
export function gmailCategoryQuery(folder: MailFolderId): string | null {
  switch (folder) {
    case "social":
      return "category:social";
    case "promotions":
      return "category:promotions";
    case "forums":
      return "category:forums";
    case "updates":
      return "category:updates";
    case "important":
      return "is:important";
    default:
      return null;
  }
}

export async function mailboxForFolder(
  client: ImapFlow,
  folder: MailFolderId,
): Promise<{ mailbox: string; search?: Record<string, unknown> }> {
  const boxes = await resolveMailboxes(client);

  switch (folder) {
    case "inbox":
      return { mailbox: boxes.inbox };
    case "all":
      return { mailbox: boxes.all };
    case "sent":
      return { mailbox: boxes.sent };
    case "spam":
      return { mailbox: boxes.spam };
    case "trash":
      return { mailbox: boxes.trash };
    case "starred":
      return { mailbox: boxes.starred, search: { flagged: true } };
    case "important": {
      const q = gmailCategoryQuery("important");
      return q
        ? { mailbox: boxes.all, search: { gmraw: q } }
        : { mailbox: boxes.important };
    }
    case "social":
    case "promotions":
    case "forums":
    case "updates": {
      const q = gmailCategoryQuery(folder);
      return {
        mailbox: boxes.all,
        search: q ? { gmraw: q } : undefined,
      };
    }
    default:
      return { mailbox: boxes.inbox };
  }
}
