import { ImapFlow } from "imapflow";
import { getActiveSmtpConfigForSend } from "@/lib/smtp-config-store";

export type ImapConnectionConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

/** Map common SMTP hosts to their IMAP counterparts. */
export function imapHostFromSmtp(smtpHost: string): { host: string; port: number } {
  const h = smtpHost.trim().toLowerCase();
  if (h.includes("gmail")) return { host: "imap.gmail.com", port: 993 };
  if (h.includes("outlook") || h.includes("office365") || h.includes("hotmail")) {
    return { host: "outlook.office365.com", port: 993 };
  }
  if (h.includes("yahoo")) return { host: "imap.mail.yahoo.com", port: 993 };
  if (h.includes("zoho")) return { host: "imap.zoho.com", port: 993 };
  if (h.startsWith("smtp.")) return { host: `imap.${h.slice(5)}`, port: 993 };
  return { host: h.replace(/^smtp\./, "imap."), port: 993 };
}

export async function resolveImapConfig(): Promise<ImapConnectionConfig> {
  const envHost = process.env.IMAP_HOST?.trim();
  const envUser = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim();
  const envPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  const smtp = await getActiveSmtpConfigForSend();
  const user = smtp?.username?.trim() || envUser || "";
  const pass = smtp?.password || envPass || "";

  if (!user || !pass) {
    throw new Error(
      "No mailbox credentials found. Save SMTP settings on Connection (same login is used for mail), or set IMAP_USER / IMAP_PASS.",
    );
  }

  if (envHost) {
    return {
      host: envHost,
      port: Number(process.env.IMAP_PORT ?? 993) || 993,
      secure: process.env.IMAP_SECURE !== "false",
      user,
      pass,
    };
  }

  const mapped = imapHostFromSmtp(smtp?.host || process.env.SMTP_HOST || "smtp.gmail.com");
  return {
    host: mapped.host,
    port: mapped.port,
    secure: true,
    user,
    pass,
  };
}

export async function withImapClient<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = await resolveImapConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function withImapMailbox<T>(
  mailbox: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  return withImapClient(async (client) => {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await fn(client);
    } finally {
      try {
        lock.release();
      } catch {
        /* ignore */
      }
    }
  });
}

export async function getAccountEmail(): Promise<string> {
  const config = await resolveImapConfig();
  return config.user;
}
