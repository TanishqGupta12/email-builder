"use client";

import { useEffect, useState } from "react";
import {
  extractPlaceholders,
  placeholderLabel,
  replacePlaceholders,
} from "@/lib/bracket-placeholders";

type Pending = {
  subject: string;
  bodyPlain: string;
};

type Props = {
  open: boolean;
  pending: Pending | null;
  onClose: () => void;
  onConfirm: (filled: Pending) => void;
};

const inputClass =
  "app-input w-full px-3 py-2.5 text-sm placeholder:text-slate-500";

export function PlaceholderFillModal({ open, pending, onClose, onConfirm }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !pending) return;
    const keys = extractPlaceholders(pending.subject, pending.bodyPlain);
    setValues(Object.fromEntries(keys.map((k) => [k, ""])));
  }, [open, pending]);

  if (!open || !pending) return null;

  const keys = extractPlaceholders(pending.subject, pending.bodyPlain);

  function submit() {
    if (!pending) return;
    const subject = replacePlaceholders(pending.subject, values);
    const bodyPlain = replacePlaceholders(pending.bodyPlain, values);
    onConfirm({ subject, bodyPlain });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="placeholder-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(90vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-blue-900/50 bg-[#0a1628] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-blue-900/40 px-4 py-4 sm:px-5">
          <h2 id="placeholder-modal-title" className="text-lg font-semibold text-white">
            Fill dynamic fields
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Replace each [field] below. Empty fields stay as placeholders in the message.
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {keys.map((token) => (
            <label key={token} className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">
                {placeholderLabel(token)}
              </span>
              <span className="block font-mono text-[10px] text-slate-500">{token}</span>
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
          ))}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-blue-900/40 px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-600/60 bg-slate-900/50 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 hover:from-blue-500 hover:to-blue-600"
          >
            Insert message
          </button>
        </div>
      </div>
    </div>
  );
}
