import Papa from "papaparse";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pulls likely emails from a line or segment (not whole HTML documents). */
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Parses recipients from the textarea + API.
 * Strips HTML first, then works line/segment-wise so pasting a full email body
 * (with many tags) does not extract dozens of false addresses from markup.
 */
export type RecipientParseStats = {
  emails: string[];
  duplicateCount: number;
};

export function parseEmailPasteStats(raw: string): RecipientParseStats {
  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicateCount = 0;

  const add = (candidate: string) => {
    const e = candidate.trim();
    if (!isValidEmail(e)) return;
    const k = e.toLowerCase();
    if (seen.has(k)) {
      duplicateCount += 1;
      return;
    }
    seen.add(k);
    emails.push(e);
  };

  const plain = raw.replace(/<[^>]+>/g, "\n");

  for (const line of plain.split(/\r?\n/)) {
    const lineTrim = line.trim();
    if (!lineTrim) continue;
    for (const segment of lineTrim.split(/[,;|]/)) {
      const seg = segment.trim();
      if (!seg) continue;
      const matches = seg.match(EMAIL_IN_TEXT) ?? [];
      if (matches.length === 0) {
        add(seg);
      } else {
        for (const m of matches) {
          add(m);
        }
      }
    }
  }
  return { emails, duplicateCount };
}

export function parseEmailPaste(raw: string): string[] {
  return parseEmailPasteStats(raw).emails;
}

/** Same rules as parseEmailPaste — used for clipboard paste into recipients. */
export function extractEmailsFromPaste(raw: string): string[] {
  return parseEmailPaste(raw);
}

export function extractEmailsFromCsvStats(text: string): RecipientParseStats {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data.filter((r) => r.some((c) => String(c).trim()));
  if (rows.length === 0) return { emails: [], duplicateCount: 0 };

  const header = rows[0].map((c) => String(c).toLowerCase().trim());
  let col = header.findIndex((h) => h === "email" || h === "e-mail" || h === "mail");
  if (col < 0) col = 0;

  const headerLooksLikeEmailColumn =
    header[col] === "email" || header[col] === "e-mail" || header[col] === "mail";
  const start = headerLooksLikeEmailColumn ? 1 : 0;

  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicateCount = 0;
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const cell = row[col];
    if (cell == null) continue;
    const value = String(cell).trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) {
      if (isValidEmail(value)) duplicateCount += 1;
      continue;
    }
    seen.add(key);
    emails.push(value);
  }
  return { emails, duplicateCount };
}

export function extractEmailsFromCsvText(text: string): string[] {
  return extractEmailsFromCsvStats(text).emails;
}

/** Unique valid addresses, plus how many extra copies were skipped. */
export function mergeRecipientStats(sources: RecipientParseStats[]): {
  valid: string[];
  invalid: string[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicateCount = sources.reduce((sum, source) => sum + source.duplicateCount, 0);

  for (const source of sources) {
    for (const raw of source.emails) {
      const value = raw.trim();
      if (!value) continue;
      if (!isValidEmail(value)) {
        invalid.push(value);
        continue;
      }
      const key = value.toLowerCase();
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      valid.push(key);
    }
  }

  return { valid, invalid, duplicateCount };
}

export function partitionEmails(rawList: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const e of rawList) {
    if (isValidEmail(e)) valid.push(e.toLowerCase());
    else invalid.push(e);
  }
  return { valid: [...new Set(valid)], invalid };
}
