export type MailFolderId =
  | "inbox"
  | "all"
  | "sent"
  | "drafts"
  | "spam"
  | "trash"
  | "scheduled"
  | "important"
  | "starred"
  | "snoozed"
  | "social"
  | "promotions"
  | "forums"
  | "updates";

export type MailSort = "date_desc" | "date_asc" | "from_asc" | "subject_asc";

/** Advanced mail search filters (IMAP + local drafts/scheduled/snoozed). */
export type MailSearchFilters = {
  q?: string;
  from?: string;
  to?: string;
  subject?: string;
  /** Inclusive lower date bound (YYYY-MM-DD or ISO). */
  since?: string;
  /** Inclusive upper date bound (YYYY-MM-DD or ISO). */
  before?: string;
  hasAttachment?: boolean;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  /** Search only the current folder, or across major folders. */
  scope?: "folder" | "all_folders";
};

export type MailListItem = {
  id: string;
  source: "imap" | "local";
  uid?: number;
  mailbox?: string;
  localId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  to: string;
  date: string | null;
  seen: boolean;
  starred: boolean;
  important: boolean;
  preview: string;
  hasAttachments: boolean;
  folderHint?: string;
};

export type MailMessage = MailListItem & {
  html: string;
  text: string;
  cc: string;
  attachments: {
    filename: string;
    contentType: string;
    size: number;
  }[];
};

export type MailAction =
  | "star"
  | "unstar"
  | "important"
  | "unimportant"
  | "read"
  | "unread"
  | "archive"
  | "spam"
  | "unspam"
  | "trash"
  | "delete"
  | "restore"
  | "snooze";

export type MailComposeInput = {
  to: string;
  cc?: string;
  subject: string;
  bodyHtml: string;
  sendAt?: string | null;
  draftId?: string | null;
};
