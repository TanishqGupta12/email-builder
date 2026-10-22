import { simpleParser } from "mailparser";
import { withImapMailbox } from "@/lib/imap";

export type InboxListItem = {
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  preview: string;
  hasAttachments: boolean;
};

export type InboxMessage = InboxListItem & {
  text: string;
  html: string;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
  }[];
};

function addressListToString(
  list: { address?: string | null; name?: string | null }[] | undefined,
): string {
  if (!list?.length) return "";
  return list
    .map((a) => {
      const email = a.address?.trim() || "";
      const name = a.name?.trim() || "";
      if (name && email) return `${name} <${email}>`;
      return email || name;
    })
    .filter(Boolean)
    .join(", ");
}

function firstAddress(list: { address?: string | null; name?: string | null }[] | undefined): {
  name: string;
  email: string;
} {
  const first = list?.[0];
  return {
    name: first?.name?.trim() || "",
    email: first?.address?.trim() || "",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listInboxMessages(
  page: number,
  pageSize: number,
): Promise<{
  items: InboxListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  mailbox: string;
}> {
  const safePageSize = Math.min(50, Math.max(1, Math.floor(pageSize) || 10));
  const safePage = Math.max(1, Math.floor(page) || 1);

  return withImapMailbox("INBOX", async (client) => {
    const mailboxInfo = client.mailbox;
    const total =
      mailboxInfo && typeof mailboxInfo === "object" ? mailboxInfo.exists : 0;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize) || 1);
    const currentPage = Math.min(safePage, totalPages);

    if (total === 0) {
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: safePageSize,
        totalPages: 1,
        mailbox: "INBOX",
      };
    }

    // Newest first: page 1 = highest sequence numbers.
    const end = total - (currentPage - 1) * safePageSize;
    const start = Math.max(1, end - safePageSize + 1);
    if (end < 1) {
      return {
        items: [],
        total,
        page: currentPage,
        pageSize: safePageSize,
        totalPages,
        mailbox: "INBOX",
      };
    }

    const range = `${start}:${end}`;
    const fetched = await client.fetchAll(range, {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
      source: { start: 0, maxLength: 12_000 },
    });

    const items: InboxListItem[] = [];
    for (const message of fetched.reverse()) {
      const envelope = message.envelope;
      const from = firstAddress(envelope?.from);
      const flags = message.flags ?? new Set<string>();
      let preview = "";
      let hasAttachments = false;

      try {
        const structure = message.bodyStructure;
        if (structure) {
          const walk = (node: { type?: string; disposition?: string; childNodes?: unknown[] }) => {
            if (node.disposition === "attachment") hasAttachments = true;
            if (Array.isArray(node.childNodes)) {
              for (const child of node.childNodes) {
                walk(child as typeof node);
              }
            }
          };
          walk(structure as { type?: string; disposition?: string; childNodes?: unknown[] });
        }
      } catch {
        /* ignore */
      }

      if (message.source) {
        try {
          const parsed = await simpleParser(message.source);
          const text =
            parsed.text?.trim() ||
            (typeof parsed.html === "string" ? stripHtml(parsed.html) : "") ||
            "";
          preview = text.slice(0, 160);
          if (parsed.attachments?.length) hasAttachments = true;
        } catch {
          preview = "";
        }
      }

      items.push({
        uid: message.uid,
        subject: envelope?.subject?.trim() || "(no subject)",
        fromName: from.name,
        fromEmail: from.email,
        to: addressListToString(envelope?.to),
        date: envelope?.date ? new Date(envelope.date).toISOString() : null,
        seen: flags.has("\\Seen"),
        flagged: flags.has("\\Flagged"),
        preview,
        hasAttachments,
      });
    }

    return {
      items,
      total,
      page: currentPage,
      pageSize: safePageSize,
      totalPages,
      mailbox: "INBOX",
    };
  });
}

export async function getInboxMessage(uid: number): Promise<InboxMessage | null> {
  return withImapMailbox("INBOX", async (client) => {
    const message = await client.fetchOne(
      String(uid),
      {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      },
      { uid: true },
    );
    if (!message) return null;

    const envelope = message.envelope;
    const from = firstAddress(envelope?.from);
    const flags = message.flags ?? new Set<string>();
    const parsed = message.source ? await simpleParser(message.source) : null;
    const html =
      typeof parsed?.html === "string"
        ? parsed.html
        : parsed?.textAsHtml ||
          (parsed?.text ? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(parsed.text)}</pre>` : "");
    const text = parsed?.text?.trim() || (html ? stripHtml(html) : "");

    const parsedFrom = (() => {
      const raw = parsed?.from;
      if (!raw) return [];
      const list = Array.isArray(raw) ? raw : [raw];
      return list.flatMap((item) => item.value ?? []);
    })();
    const parsedTo = (() => {
      const raw = parsed?.to;
      if (!raw) return [];
      const list = Array.isArray(raw) ? raw : [raw];
      return list.flatMap((item) => item.value ?? []);
    })();

    // Mark as seen when opened.
    try {
      await client.messageFlagsAdd([uid], ["\\Seen"], { uid: true });
    } catch {
      /* ignore */
    }

    return {
      uid: message.uid,
      subject: envelope?.subject?.trim() || parsed?.subject?.trim() || "(no subject)",
      fromName: from.name || firstAddress(parsedFrom).name,
      fromEmail: from.email || firstAddress(parsedFrom).email,
      to: addressListToString(envelope?.to) || addressListToString(parsedTo),
      date: envelope?.date
        ? new Date(envelope.date).toISOString()
        : parsed?.date
          ? parsed.date.toISOString()
          : null,
      seen: true,
      flagged: flags.has("\\Flagged"),
      preview: text.slice(0, 160),
      hasAttachments: (parsed?.attachments?.length ?? 0) > 0,
      text,
      html: html || `<p>${escapeHtml(text || "(empty message)")}</p>`,
      attachments: (parsed?.attachments ?? []).map((a) => ({
        filename: a.filename || "attachment",
        contentType: a.contentType || "application/octet-stream",
        size: a.size || a.content?.length || 0,
      })),
    };
  });
}

export async function setInboxMessageSeen(uids: number[], seen: boolean): Promise<number> {
  if (uids.length === 0) return 0;
  return withImapMailbox("INBOX", async (client) => {
    if (seen) {
      await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
    } else {
      await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
    }
    return uids.length;
  });
}

export async function deleteInboxMessages(uids: number[]): Promise<number> {
  if (uids.length === 0) return 0;
  return withImapMailbox("INBOX", async (client) => {
    await client.messageDelete(uids, { uid: true });
    return uids.length;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
