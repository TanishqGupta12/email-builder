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
export function parseEmailPaste(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (candidate: string) => {
    const e = candidate.trim();
    if (!isValidEmail(e)) return;
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
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
  return out;
}

/** Same rules as parseEmailPaste — used for clipboard paste into recipients. */
export function extractEmailsFromPaste(raw: string): string[] {
  return parseEmailPaste(raw);
}

export function extractEmailsFromCsvText(text: string): string[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data.filter((r) => r.some((c) => String(c).trim()));
  if (rows.length === 0) return [];

  const header = rows[0].map((c) => String(c).toLowerCase().trim());
  let col = header.findIndex((h) => h === "email" || h === "e-mail" || h === "mail");
  if (col < 0) col = 0;

  const headerLooksLikeEmailColumn =
    header[col] === "email" || header[col] === "e-mail" || header[col] === "mail";
  const start = headerLooksLikeEmailColumn ? 1 : 0;

  const out: string[] = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const cell = row[col];
    if (cell != null && String(cell).trim()) {
      out.push(String(cell).trim());
    }
  }
  return [...new Set(out)];
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
