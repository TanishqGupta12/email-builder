import { randomUUID } from "crypto";

export type RecipientStatus = "PENDING" | "SENT" | "FAILED";

export type CampaignStatus = "QUEUED" | "SENDING" | "COMPLETED";

export type Recipient = {
  id: string;
  email: string;
  status: RecipientStatus;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type Attachment = {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
};

export type Campaign = {
  id: string;
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  sendMode: string;
  delayMs: number;
  status: CampaignStatus;
  invalidEmails: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  recipients: Recipient[];
  attachments: Attachment[];
};

const g = globalThis as unknown as { __emailCampaignStore?: Map<string, Campaign> };
if (!g.__emailCampaignStore) {
  g.__emailCampaignStore = new Map();
}
const store = g.__emailCampaignStore;

export function createCampaign(input: {
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  sendMode: string;
  delayMs: number;
  validEmails: string[];
  invalidEmails: string[] | null;
}): Campaign {
  const id = randomUUID();
  const now = new Date();
  const recipients: Recipient[] = input.validEmails.map((email) => ({
    id: randomUUID(),
    email,
    status: "PENDING",
    errorMessage: null,
    sentAt: null,
    createdAt: now,
  }));

  const campaign: Campaign = {
    id,
    senderEmail: input.senderEmail,
    subject: input.subject,
    bodyHtml: input.bodyHtml,
    sendMode: input.sendMode,
    delayMs: input.delayMs,
    status: "QUEUED",
    invalidEmails: input.invalidEmails,
    createdAt: now,
    updatedAt: now,
    recipients,
    attachments: [],
  };
  store.set(id, campaign);
  return campaign;
}

export function getCampaign(id: string): Campaign | undefined {
  return store.get(id);
}

export function listRecentCampaigns(limit: number): Campaign[] {
  return [...store.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function setCampaignStatus(id: string, status: CampaignStatus): void {
  const c = store.get(id);
  if (!c) return;
  c.status = status;
  c.updatedAt = new Date();
}

export function patchRecipient(
  campaignId: string,
  recipientId: string,
  patch: Partial<Pick<Recipient, "status" | "errorMessage" | "sentAt">>,
): void {
  const c = store.get(campaignId);
  if (!c) return;
  const r = c.recipients.find((x) => x.id === recipientId);
  if (!r) return;
  Object.assign(r, patch);
  c.updatedAt = new Date();
}

export function failAllPendingRecipients(campaignId: string, errorMessage: string): void {
  const c = store.get(campaignId);
  if (!c) return;
  for (const r of c.recipients) {
    if (r.status === "PENDING") {
      r.status = "FAILED";
      r.errorMessage = errorMessage;
    }
  }
  c.updatedAt = new Date();
}

export function aggregateStats(): {
  sent: number;
  failed: number;
  pending: number;
  campaigns: number;
} {
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const c of store.values()) {
    for (const r of c.recipients) {
      if (r.status === "SENT") sent++;
      else if (r.status === "FAILED") failed++;
      else pending++;
    }
  }
  return { sent, failed, pending, campaigns: store.size };
}
