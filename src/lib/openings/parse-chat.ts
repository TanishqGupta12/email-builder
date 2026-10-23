import Papa from "papaparse";

export type OpeningRow = {
  date: string;
  time: string;
  sender: string;
  role: string;
  companyName: string;
  description: string;
  experience: string;
  location: string;
  workMode: string;
  salary: string;
  skills: string;
  emails: string;
  contactPhone: string;
  message: string;
  sourceFile: string;
};

export type ChatParseResult = {
  messageCount: number;
  rows: OpeningRow[];
};

const HEADER =
  /^(?:\[)?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]m)?(?:\])?\s+-\s+([\s\S]*)$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const COMPANY_STOP = new Set([
  "we",
  "the",
  "our",
  "this",
  "that",
  "hiring",
  "senior",
  "junior",
  "immediate",
  "looking",
  "interested",
  "please",
  "share",
  "required",
  "remote",
  "hybrid",
  "urgent",
  "virtual",
  "drive",
]);

function normalize(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/[\u200e\u200f\u202a\u202c]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function cleanValue(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\(mailto:[^)]+\)/gi, "$1")
    .replace(/\bamp;/g, "&")
    .replace(/([a-z])(?=Required|Skills|Location|Experience|Position|Company)/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/^[\s|:;,\-–—]+|[\s|:;,\-–—]+$/g, "")
    .trim();
}

function clip(value: string, max: number): string {
  const clean = cleanValue(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function stripMarks(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, " ");
}

function field(text: string, labels: string[]): string {
  const re = new RegExp(
    `(?:^|\\n)[^\\n]{0,16}(?:${labels.join("|")})\\s*[:\\-–—|]\\s*([^\\n]+)`,
    "i",
  );
  const match = stripMarks(text).match(re);
  return match ? cleanValue(match[1]) : "";
}

function isSectionHeading(line: string): boolean {
  if (
    /^(experience|location|work mode|salary|ctc|company|position|role|joining|duration|shift|notice|interview|passport|timing|eligibility|qualification|preference)\s*[:\-–—]/i.test(
      line,
    )
  ) {
    return line.length < 90;
  }
  if (/^(required skills|key skills|skills required|must-have skills|key skill|skills)\b/i.test(line) && line.length < 40) {
    return true;
  }
  if (line.length > 48) return false;
  return /^(what we|responsibilities|requirements|qualification|eligibility|how to|apply|about|job description|good to have|interested|send resume|send your|please mention)\b/i.test(
    line,
  );
}

function sectionAt(plain: string, match: RegExpExecArray): string {
  const lines: string[] = [];
  const first = cleanValue((match[1] ?? "").replace(/^[\s•·*\-–—]+/, ""));
  if (first && !isSectionHeading(first)) lines.push(first);
  let started = lines.length > 0;
  for (const rawLine of plain.slice(match.index + match[0].length).split("\n")) {
    const line = cleanValue(rawLine.replace(/^[\s•·*\-–—]+/, ""));
    if (!line) {
      if (started) break;
      continue;
    }
    if (isSectionHeading(line) || /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(line)) break;
    lines.push(line);
    started = true;
    if (lines.join("; ").length > 500) break;
  }
  return lines.join("; ");
}

function section(text: string, labels: string[]): string {
  const plain = stripMarks(text);
  const start = new RegExp(
    `(?:^|\\n)[^\\n]{0,16}(?:${labels.join("|")})[ \\t]*[:\\-–—|][ \\t]*([^\\n]*)`,
    "gi",
  );
  let best = "";
  for (const match of plain.matchAll(start)) {
    const collected = sectionAt(plain, match);
    if (collected.length > best.length) best = collected;
  }
  return clip(best, 500);
}

function emailsOf(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(EMAIL_RE)) {
    found.add(match[0].replace(/[.,;:)]+$/, "").toLowerCase());
  }
  return [...found];
}

function roleOf(text: string): string {
  const labeled = field(text, ["Job Title", "Position", "Role", "Opening"]);
  if (labeled && labeled.length < 140) return labeled;
  const hiring = stripMarks(text).match(
    /(?:^|\n)\s*(?:Hiring|We(?:'|’)re Hiring|WE ARE HIRING)\s*[:|\-–—]\s*([^\n]+)/i,
  );
  if (hiring) return clip(hiring[1], 140);
  const lines = stripMarks(text)
    .split("\n")
    .map((line) => cleanValue(line))
    .filter(Boolean);
  for (const line of lines.slice(0, 4)) {
    if (
      line.length > 8 &&
      line.length < 140 &&
      /developer|engineer|hiring|opening|architect|designer|analyst|lead\b/i.test(line)
    ) {
      return line;
    }
  }
  return "";
}

const ROLE_PREFIX =
  /^(senior|junior|lead|frontend|backend|full|stack|developer|engineer|software|designer|intern|graphic|mern|hiring|node\.?js|react\.?js|angular|python|java|php|ios|android|ml|ai)$/i;

function trimCompany(name: string): string {
  const separated = name.replace(/(Developer|Engineer|Designer|Intern)(?=[A-Z])/g, "");
  let parts = separated.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && ROLE_PREFIX.test(parts[0].replace(/\.$/, ""))) parts = parts.slice(1);
  const trimmed = parts.join(" ");
  if (/^(?:pvt\.?|private|ltd\.?|limited|inc\.?|llc)(?:\s+(?:pvt\.?|private|ltd\.?|limited|inc\.?|llc))*$/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function acceptCompany(name: string): string {
  const cut = name.split(
    /\s+(?=(?:Location|Experience|Exp|Salary|Notice|Skills|Role|Position|Work Mode)\s*[:\-–—])/i,
  )[0];
  const trimmed = trimCompany(cleanValue(cut));
  if (!trimmed || trimmed.length < 2 || trimmed.length > 60) return "";
  if (/[:|]/.test(trimmed)) return "";
  if (/\b(ctc|opportunity|location|notice|salary|experience|expected|current)\b/i.test(trimmed)) return "";
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (COMPANY_STOP.has(first)) return "";
  return trimmed;
}

function companyOf(text: string): string {
  const labeled = acceptCompany(field(text, ["Company Name", "Organization", "Company"]));
  if (labeled) return labeled;
  const plain = stripMarks(text);
  const word = "[A-Z][\\w&.'’-]+";
  const space = "[ \\t]+";
  const patterns = [
    new RegExp(
      `\\b(${word}(?:${space}${word}){0,5}${space}(?:Pvt\\.?${space}Ltd\\.?|Private${space}Limited|Inc\\.?|LLC|Ltd\\.?|Limited))\\b`,
    ),
    new RegExp(`\\b(${word}(?:${space}${word}){0,4})${space}is${space}(?:hiring|looking)\\b`),
    new RegExp(`\\bJoin${space}(${word}(?:${space}${word}){0,4})\\b`),
  ];
  for (const pattern of patterns) {
    const match = plain.match(pattern);
    if (!match) continue;
    const name = acceptCompany(match[1].replace(/\s+(and|to|for|in|on|with)\b[\s\S]*$/i, ""));
    if (name) return name;
  }
  return "";
}

function experienceOf(text: string): string {
  const labeled = field(text, [
    "Required Experience",
    "Total Experience",
    "Experience",
    "Exp",
  ]);
  if (labeled && /\d/.test(labeled)) return clip(labeled, 80);
  const match = stripMarks(text).match(
    /\b(\d+\s*(?:\+|plus|to|-|–|—)\s*\d+\s*(?:years?|yrs?)|\d+\s*\+\s*(?:years?|yrs?)|minimum\s+\d+\+?\s*(?:years?|yrs?))/i,
  );
  if (match) return cleanValue(match[1]);
  return labeled ? clip(labeled, 80) : "";
}

function locationOf(text: string): string {
  const labeled = field(text, ["Job Location", "Work Location", "Location"]);
  if (labeled && labeled.length < 80) return labeled;
  const plain = stripMarks(text);
  const embedded = plain.match(/\|\s*([^|\n]{2,40}?)\s+Location\b/i);
  if (embedded) return clip(embedded[1], 80);
  return locationFromTitle(roleOf(text));
}

function locationFromTitle(title: string): string {
  const parts = title.split("|").map((part) => cleanValue(part)).filter(Boolean);
  if (parts.length < 2) return "";
  const place = parts.find((part) => {
    if (part.length < 3 || part.length > 40 || /\d/.test(part)) return false;
    return !/developer|engineer|hiring|skill|react|angular|node|python|java|stack|contract|hire|interview|wfo|remote|hybrid|urgent|opening|position|full|senior/i.test(
      part,
    );
  });
  return place ?? "";
}

function workModeOf(text: string): string {
  const labeled = field(text, ["Mode of work", "Work Model", "Work Mode", "Employment Type"]);
  if (labeled && labeled.length < 60) return labeled;
  const found = new Set<string>();
  for (const match of stripMarks(text).matchAll(
    /\b(remote|hybrid|onsite|on-site|on site|wfo|wfh|work from home|work from office)\b/gi,
  )) {
    found.add(cleanValue(match[1]));
  }
  return [...found].slice(0, 3).join("; ");
}

function salaryOf(text: string): string {
  const found: string[] = [];
  const labeled = field(text, ["Compensation", "Package", "Salary", "CTC"]);
  if (labeled) found.push(cleanValue(labeled));
  const plain = stripMarks(text);
  for (const match of plain.matchAll(
    /₹\s*[\d.,]+(?:\s*(?:–|-|to)\s*[\d.,]+)?(?:\s*(?:LPA|lakh|L))?/gi,
  )) {
    found.push(cleanValue(match[0]));
  }
  for (const match of plain.matchAll(
    /\b\d+(?:\.\d+)?\s*(?:–|-|to)\s*\d+(?:\.\d+)?\s*LPA\b/gi,
  )) {
    found.push(cleanValue(match[0]));
  }
  const kept: string[] = [];
  for (const item of found) {
    const key = item.toLowerCase().replace(/₹/g, "").trim();
    if (!key) continue;
    const index = kept.findIndex((existing) => {
      const other = existing.toLowerCase().replace(/₹/g, "");
      return other.includes(key) || key.includes(other);
    });
    if (index === -1) kept.push(item);
    else if (item.length > kept[index].length) kept[index] = item;
  }
  return kept.slice(0, 3).join("; ");
}

function phonesOf(text: string, sender: string): string {
  const senderDigits = sender.replace(/\D/g, "");
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:\+?\d[\d\s-]{8,}\d)/g)) {
    const raw = match[0].trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) continue;
    if (senderDigits && (senderDigits.endsWith(digits) || digits.endsWith(senderDigits))) continue;
    found.add(raw.replace(/\s+/g, " "));
  }
  return [...found].slice(0, 3).join("; ");
}

function descriptionOf(text: string): string {
  const labeled = section(text, [
    "Job Description",
    "Company Description",
    "About the Company",
    "About the Role",
    "About Us",
  ]);
  if (labeled) return labeled;
  const paragraph = text
    .split(/\n\s*\n/)
    .map((part) => cleanValue(stripMarks(part)))
    .find(
      (part) =>
        part.length > 40 &&
        /we are|we're|we’re|looking for|is hiring|is looking/i.test(part),
    );
  return paragraph ? clip(paragraph, 500) : "";
}

function isServiceAd(text: string): boolean {
  return (
    /₹\s*\d+/.test(text) &&
    /resume review|ats-friendly resume|mock interview|linkedin profile optimization|portfolio website/i.test(
      text,
    ) &&
    !/\bhiring\b/i.test(text)
  );
}

function isJob(text: string, emails: string[]): boolean {
  if (/this message was deleted|you deleted this message|<media omitted>|omitted>/i.test(text)) {
    return false;
  }
  if (isServiceAd(text)) return false;
  if (emails.length > 0) return true;
  return (
    text.length > 80 &&
    /\b(hiring|opening|experience|developer|engineer|job description)\b/i.test(text)
  );
}

function separateLabels(text: string): string {
  return text.replace(
    /([a-z.])(?=(?:Location|Experience|Company|Skills|Position|Role|Salary|CTC)\s*:)/gi,
    "$1\n",
  );
}

function toRow(
  draft: { date: string; time: string; sender: string; lines: string[] },
  sourceFile: string,
): OpeningRow | null {
  const message = separateLabels(draft.lines.join("\n").replace(/<This message was edited>/gi, "")).trim();
  if (!message) return null;
  const emails = emailsOf(message);
  if (!isJob(message, emails)) return null;
  return {
    date: draft.date,
    time: draft.time,
    sender: draft.sender,
    role: roleOf(message),
    companyName: companyOf(message),
    description: descriptionOf(message),
    experience: experienceOf(message),
    location: locationOf(message),
    workMode: workModeOf(message),
    salary: salaryOf(message),
    skills: section(message, [
      "Required Skills",
      "Key Skills",
      "Skills Required",
      "Must-Have Skills",
      "Must Have Skills",
      "Key Skill",
      "Skills",
    ]),
    emails: emails.join("; "),
    contactPhone: phonesOf(message, draft.sender),
    message: cleanValue(message),
    sourceFile,
  };
}

function matchHeader(line: string): {
  date: string;
  time: string;
  sender: string;
  first: string;
} | null {
  const match = line.match(HEADER);
  if (!match) return null;
  const rest = match[4] ?? "";
  const splitAt = rest.indexOf(": ");
  if (splitAt <= 0) return null;
  const sender = rest.slice(0, splitAt).trim();
  if (!sender || sender.length > 80) return null;
  const time = [match[2], match[3]].filter(Boolean).join(" ");
  return {
    date: match[1],
    time,
    sender,
    first: rest.slice(splitAt + 2),
  };
}

export function parseWhatsappChat(raw: string, sourceFile = ""): ChatParseResult {
  const text = normalize(raw);
  const rows: OpeningRow[] = [];
  let messageCount = 0;
  let draft: { date: string; time: string; sender: string; lines: string[] } | null = null;

  const flush = () => {
    if (!draft) return;
    messageCount += 1;
    const row = toRow(draft, sourceFile);
    if (row) rows.push(row);
    draft = null;
  };

  for (const line of text.split("\n")) {
    const header = matchHeader(line);
    if (header) {
      flush();
      draft = {
        date: header.date,
        time: header.time,
        sender: header.sender,
        lines: header.first ? [header.first] : [],
      };
      continue;
    }
    if (draft) draft.lines.push(line);
  }
  flush();
  return { messageCount, rows };
}

export function experienceBounds(value: string): { min: number; max: number } | null {
  const text = value.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const monthsOnly = /month/i.test(text) && !/year|\byrs?\b/i.test(text);
  const scale = (years: number) => (monthsOnly ? years / 12 : years);

  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|\bto\b)\s*(\d+(?:\.\d+)?)/i);
  if (range) {
    const low = scale(Number(range[1]));
    const high = scale(Number(range[2]));
    return { min: Math.min(low, high), max: Math.max(low, high) };
  }
  const atLeast = text.match(/(\d+(?:\.\d+)?)\s*\+|((?:minimum|min\.?|at least)\s*)(\d+(?:\.\d+)?)/i);
  if (atLeast) {
    const years = scale(Number(atLeast[1] || atLeast[3]));
    return { min: years, max: Number.POSITIVE_INFINITY };
  }
  const single = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|months?)/i);
  if (single) {
    const years = scale(Number(single[1]));
    return { min: years, max: years };
  }
  return null;
}

export function openingsToCsv(rows: OpeningRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      date: row.date,
      time: row.time,
      sender: row.sender,
      role: row.role,
      company_name: row.companyName,
      description: row.description,
      experience: row.experience,
      location: row.location,
      work_mode: row.workMode,
      salary: row.salary,
      skills: row.skills,
      emails: row.emails,
      contact_phone: row.contactPhone,
      source_file: row.sourceFile,
      message: row.message,
    })),
  );
}
