import { experienceBounds, type OpeningRow } from "@/lib/openings/parse-chat";

export const OPENING_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "sender", label: "Sender" },
  { key: "role", label: "Role" },
  { key: "companyName", label: "Company" },
  { key: "description", label: "Description" },
  { key: "experience", label: "Experience" },
  { key: "location", label: "Location" },
  { key: "workMode", label: "Work mode" },
  { key: "salary", label: "Salary" },
  { key: "skills", label: "Skills" },
  { key: "emails", label: "Email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "sourceFile", label: "Source file" },
  { key: "message", label: "Message" },
] as const satisfies ReadonlyArray<{ key: keyof OpeningRow; label: string }>;

export type OpeningColumnKey = (typeof OPENING_COLUMNS)[number]["key"];

export type EmailPresence = "any" | "has" | "missing";

export type OpeningFilters = {
  text: Partial<Record<OpeningColumnKey, string>>;
  emailPresence: EmailPresence;
  experienceMin: string;
  experienceMax: string;
};

export const EMPTY_OPENING_FILTERS: OpeningFilters = {
  text: {},
  emailPresence: "any",
  experienceMin: "",
  experienceMax: "",
};

function contains(value: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return value.toLowerCase().includes(needle);
}

function yearsLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const years = Number(trimmed);
  return Number.isFinite(years) && years >= 0 ? years : null;
}

export function filterOpenings(rows: OpeningRow[], filters: OpeningFilters): OpeningRow[] {
  const minYears = yearsLimit(filters.experienceMin);
  const maxYears = yearsLimit(filters.experienceMax);

  return rows.filter((row) => {
    if (filters.emailPresence === "has" && !row.emails.trim()) return false;
    if (filters.emailPresence === "missing" && row.emails.trim()) return false;
    if (minYears !== null || maxYears !== null) {
      const bounds = experienceBounds(row.experience);
      if (!bounds) return false;
      const low = minYears ?? 0;
      const high = maxYears ?? Number.POSITIVE_INFINITY;
      if (bounds.min > high || bounds.max < low) return false;
    }
    return OPENING_COLUMNS.every((column) => contains(row[column.key], filters.text[column.key] ?? ""));
  });
}

export function filtersAreActive(filters: OpeningFilters): boolean {
  if (filters.emailPresence !== "any") return true;
  if (filters.experienceMin.trim() || filters.experienceMax.trim()) return true;
  return OPENING_COLUMNS.some((column) => (filters.text[column.key] ?? "").trim().length > 0);
}
