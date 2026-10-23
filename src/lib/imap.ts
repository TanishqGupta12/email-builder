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

type ImapPool = {
  key: string;
  client: ImapFlow;
  idle: ReturnType<typeof setTimeout> | null;
};

const imapGlobal = globalThis as typeof globalThis & {
  __postlineImapPool?: ImapPool | null;
  __postlineImapQueue?: Promise<void>;
};

function configKey(config: ImapConnectionConfig): string {
  return `${config.host}:${config.port}:${config.user}:${config.pass}`;
}

async function closeImapPool(): Promise<void> {
  const current = imapGlobal.__postlineImapPool;
  imapGlobal.__postlineImapPool = null;
  if (!current) return;
  if (current.idle) clearTimeout(current.idle);
  try {
    await current.client.logout();
  } catch {
    try {
      current.client.close();
    } catch {
      /* ignore */
    }
  }
}

function armImapIdle(): void {
  const current = imapGlobal.__postlineImapPool;
  if (!current) return;
  if (current.idle) clearTimeout(current.idle);
  current.idle = setTimeout(() => {
    void closeImapPool();
  }, 90_000);
}

async function ensureImapClient(): Promise<ImapFlow> {
  const config = await resolveImapConfig();
  const key = configKey(config);
  const current = imapGlobal.__postlineImapPool;
  if (current && current.key === key && current.client.usable) return current.client;
  await closeImapPool();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  });
  await client.connect();
  imapGlobal.__postlineImapPool = { key, client, idle: null };
  return client;
}

function chainImap<T>(task: () => Promise<T>): Promise<T> {
  const previous = imapGlobal.__postlineImapQueue ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  imapGlobal.__postlineImapQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function withImapClient<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  return chainImap(async () => {
    const current = imapGlobal.__postlineImapPool;
    if (current?.idle) {
      clearTimeout(current.idle);
      current.idle = null;
    }
    try {
      const client = await ensureImapClient();
      return await fn(client);
    } catch (err) {
      await closeImapPool();
      throw err;
    } finally {
      armImapIdle();
    }
  });
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
