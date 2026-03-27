import { randomUUID } from "crypto";

export type SmtpProvider = "SMTP";

export type SmtpEncryption = "tls" | "ssl" | "none";

export type SmtpConfigRecord = {
  id: string;
  name: string;
  provider: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  active: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const g = globalThis as unknown as {
  __smtpConfigStore?: Map<string, SmtpConfigRecord>;
  /** True after we attempted a one-time seed from env while store was empty. */
  __smtpEnvSeedAttempted?: boolean;
};
if (!g.__smtpConfigStore) {
  g.__smtpConfigStore = new Map();
}
const store = g.__smtpConfigStore;

function now(): Date {
  return new Date();
}

function encryptionFromPort(port: number): SmtpEncryption {
  if (port === 465) return "ssl";
  return "tls";
}

/** One-time seed from process.env when the store is empty and credentials exist. */
export function seedSmtpConfigFromEnvIfEmpty(): void {
  if (store.size > 0) return;
  if (g.__smtpEnvSeedAttempted) return;
  g.__smtpEnvSeedAttempted = true;

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return;

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587) || 587;
  const id = randomUUID();
  const t = now();
  const rec: SmtpConfigRecord = {
    id,
    name: "Environment (.env)",
    provider: "SMTP",
    host,
    port,
    username: user,
    password: pass,
    encryption: encryptionFromPort(port),
    active: true,
    isDefault: true,
    createdAt: t,
    updatedAt: t,
  };
  store.set(id, rec);
}

export function listSmtpConfigs(): (Omit<SmtpConfigRecord, "password"> & {
  passwordSet: boolean;
})[] {
  seedSmtpConfigFromEnvIfEmpty();
  return [...store.values()]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map(({ password, ...rest }) => ({
      ...rest,
      passwordSet: password.length > 0,
    }));
}

export function getSmtpConfig(id: string): SmtpConfigRecord | undefined {
  seedSmtpConfigFromEnvIfEmpty();
  return store.get(id);
}

function clearOtherDefaults(exceptId: string): void {
  for (const c of store.values()) {
    if (c.id !== exceptId) c.isDefault = false;
  }
}

export function createSmtpConfig(input: {
  name: string;
  provider?: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  active: boolean;
  isDefault: boolean;
}): SmtpConfigRecord {
  seedSmtpConfigFromEnvIfEmpty();
  const id = randomUUID();
  const t = now();
  const rec: SmtpConfigRecord = {
    id,
    name: input.name.trim() || "SMTP configuration",
    provider: input.provider ?? "SMTP",
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    password: input.password,
    encryption: input.encryption,
    active: input.active,
    isDefault: input.isDefault,
    createdAt: t,
    updatedAt: t,
  };
  if (rec.isDefault) clearOtherDefaults(id);
  store.set(id, rec);
  return rec;
}

export function updateSmtpConfig(
  id: string,
  patch: Partial<{
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    encryption: SmtpEncryption;
    active: boolean;
    isDefault: boolean;
    clearPassword: boolean;
  }>,
): SmtpConfigRecord | undefined {
  seedSmtpConfigFromEnvIfEmpty();
  const c = store.get(id);
  if (!c) return undefined;

  if (patch.name !== undefined) c.name = patch.name.trim() || c.name;
  if (patch.host !== undefined) c.host = patch.host.trim();
  if (patch.port !== undefined) c.port = patch.port;
  if (patch.username !== undefined) c.username = patch.username.trim();
  if (patch.encryption !== undefined) c.encryption = patch.encryption;
  if (patch.active !== undefined) c.active = patch.active;
  if (patch.isDefault !== undefined) c.isDefault = patch.isDefault;
  if (patch.clearPassword === true) c.password = "";
  if (patch.password !== undefined && patch.password.length > 0) {
    c.password = patch.password;
  }

  if (c.isDefault) clearOtherDefaults(id);
  c.updatedAt = now();
  return c;
}

export function deleteSmtpConfig(id: string): boolean {
  seedSmtpConfigFromEnvIfEmpty();
  const c = store.get(id);
  if (!c) return false;
  const wasDefault = c.isDefault;
  store.delete(id);
  if (wasDefault && store.size > 0) {
    const first = [...store.values()].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )[0];
    if (first) {
      first.isDefault = true;
      first.updatedAt = now();
    }
  }
  return true;
}

/** Active config used for sending: default among active, else first active. */
export function getActiveSmtpConfigForSend(): SmtpConfigRecord | null {
  seedSmtpConfigFromEnvIfEmpty();
  const all = [...store.values()].filter((c) => c.active);
  if (all.length === 0) return null;
  const def = all.find((c) => c.isDefault);
  return def ?? all[0];
}
