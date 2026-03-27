"use client";

import { useEffect, useMemo, useState } from "react";
import {
  extractPlaceholders,
  placeholderLabel,
  replacePlaceholders,
} from "@/lib/bracket-placeholders";

type Props = {
  subject: string;
  bodyHtml: string;
  onApply: (next: { subject: string; bodyHtml: string }) => void;
};

const inputClass =
  "app-input w-full px-3 py-2 text-sm placeholder:text-slate-500";

export function DynamicPlaceholdersPanel({ subject, bodyHtml, onApply }: Props) {
  const tokens = useMemo(
    () => extractPlaceholders(subject, bodyHtml),
    [subject, bodyHtml],
  );

  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues((prev) => {
      const next = { ...prev };
      for (const t of tokens) {
        if (!(t in next)) next[t] = "";
      }
      for (const k of Object.keys(next)) {
        if (!tokens.includes(k)) delete next[k];
      }
      return next;
    });
  }, [tokens]);

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-emerald-100/95">
            Dynamic fields
          </h3>
          <p className="text-xs text-slate-500">
            Fill values for <code className="text-emerald-400/90">[brackets]</code> in subject
            &amp; message, then apply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onApply({
              subject: replacePlaceholders(subject, values),
              bodyHtml: replacePlaceholders(bodyHtml, values),
            });
          }}
          className="mt-2 shrink-0 rounded-lg bg-emerald-700/80 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 sm:mt-0"
        >
          Apply to subject &amp; message
        </button>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {tokens.map((token) => (
          <li key={token}>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-300">
                {placeholderLabel(token)}
              </span>
              <input
                type="text"
                value={values[token] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [token]: e.target.value }))
                }
                className={inputClass}
                placeholder={placeholderLabel(token)}
                autoComplete="off"
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
