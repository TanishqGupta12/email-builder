const STORAGE_KEY = "email-builder-custom-merge-fields";

export function loadCustomFieldLabels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(
      parsed
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean),
    )];
  } catch {
    return [];
  }
}

export function saveCustomFieldLabels(labels: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(labels)]));
  } catch {
    /* ignore quota */
  }
}
