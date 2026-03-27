/** Tokens like `[Name]`, `[Company Name]` used as merge fields. */
export const TOKEN_RE = /\[[^\]]+\]/g;

/** Reject labels that would break `[...]` tokens. */
export function sanitizeMergeFieldLabel(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (/[\[\]]/.test(t)) return null;
  return t;
}

/** Turn a display label into the merge token inserted in subject/body. */
export function labelToBracketToken(label: string): string {
  return `[${label}]`;
}

/** Unique `[...]` tokens in order of first appearance (searches all strings). */
export function extractPlaceholders(...texts: string[]): string[] {
  const combined = texts.filter(Boolean).join("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of combined.matchAll(/\[[^\]]+\]/g)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      out.push(m[0]);
    }
  }
  return out;
}

/** Human label for a token, e.g. `[Your Name]` → `Your Name`. */
export function placeholderLabel(token: string): string {
  if (token.length < 2 || !token.startsWith("[") || !token.endsWith("]")) {
    return token;
  }
  return token.slice(1, -1).trim() || token;
}

/**
 * Replace each `[key]` with `values[key]`. Empty / missing values leave the token unchanged.
 */
export function replacePlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(TOKEN_RE, (token) => {
    const v = values[token];
    if (v === undefined || v.trim() === "") return token;
    return v;
  });
}
