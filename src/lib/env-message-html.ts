/** Escape and turn plain text into safe HTML for TipTap (paragraphs + line breaks). */
export function plainTextToEmailHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const t = text.trim();
  if (!t) return "<p></p>";
  const blocks = text.split(/\r?\n\r?\n+/);
  if (blocks.length > 1) {
    return blocks
      .map((b) => b.trim())
      .filter(Boolean)
      .map((b) => `<p>${esc(b).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  return `<p>${esc(text).replace(/\n/g, "<br>")}</p>`;
}

/** If MESSAGE looks like HTML, use as-is; otherwise treat as plain text. */
export function envMessageToHtml(raw: string | undefined): string {
  if (raw == null || !String(raw).trim()) return "";
  const s = String(raw);
  const trimmed = s.trimStart();
  if (trimmed.startsWith("<") && /<\/[a-z][\s\S]*>/i.test(s)) {
    return s.trim();
  }
  return plainTextToEmailHtml(s);
}
