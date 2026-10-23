import Papa from "papaparse";

const HEADER_NAMES = new Set([
  "phone",
  "mobile",
  "whatsapp",
  "number",
  "wa",
  "phone number",
  "mobile number",
  "whatsapp number",
  "contact",
  "tel",
  "telephone",
]);

/** Digits only, country code included, no leading plus. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits = compact.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}

export type PhoneParseStats = {
  values: string[];
  duplicateCount: number;
};

export function parsePhonePasteStats(raw: string): PhoneParseStats {
  const seen = new Set<string>();
  const values: string[] = [];
  let duplicateCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    for (const segment of line.split(/[,;|]/)) {
      const value = segment.trim();
      if (!value) continue;
      const key = normalizePhone(value) ?? value.toLowerCase();
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      values.push(value);
    }
  }

  return { values, duplicateCount };
}

export function extractPhonesFromCsvStats(text: string): PhoneParseStats {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = parsed.data.filter((row) => row.some((cell) => String(cell).trim()));
  if (rows.length === 0) return { values: [], duplicateCount: 0 };

  const header = rows[0].map((cell) => String(cell).toLowerCase().trim());
  let col = header.findIndex((name) => HEADER_NAMES.has(name));
  if (col < 0) col = 0;
  const start = HEADER_NAMES.has(header[col] ?? "") ? 1 : 0;

  const seen = new Set<string>();
  const values: string[] = [];
  let duplicateCount = 0;

  for (let i = start; i < rows.length; i++) {
    const cell = rows[i][col];
    if (cell == null) continue;
    const value = String(cell).trim();
    if (!value) continue;
    const key = normalizePhone(value) ?? value.toLowerCase();
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    values.push(value);
  }

  return { values, duplicateCount };
}

export function mergePhoneStats(sources: PhoneParseStats[]): {
  valid: string[];
  invalid: string[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicateCount = sources.reduce((sum, source) => sum + source.duplicateCount, 0);

  for (const source of sources) {
    for (const raw of source.values) {
      const phone = normalizePhone(raw);
      if (!phone) {
        const label = raw.trim();
        if (label) invalid.push(label);
        continue;
      }
      if (seen.has(phone)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(phone);
      valid.push(phone);
    }
  }

  return { valid, invalid, duplicateCount };
}
