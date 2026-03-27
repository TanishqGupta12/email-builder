"use client";

import { useEffect, useState } from "react";
import {
  labelToBracketToken,
  sanitizeMergeFieldLabel,
} from "@/lib/bracket-placeholders";
import {
  loadCustomFieldLabels,
  saveCustomFieldLabels,
} from "@/lib/custom-fields-storage";

type Props = {
  onInsertSubject: (token: string) => void;
  onInsertMessage: (token: string) => void;
};

const inputClass =
  "app-input w-full px-3 py-2 text-sm placeholder:text-slate-500";

export function CustomMergeFieldsPanel({
  onInsertSubject,
  onInsertMessage,
}: Props) {
  const [open, setOpen] = useState(true);
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setLabels(loadCustomFieldLabels());
  }, []);

  function persist(next: string[]) {
    setLabels(next);
    saveCustomFieldLabels(next);
  }

  function addField() {
    setHint(null);
    const clean = sanitizeMergeFieldLabel(newLabel);
    if (!clean) {
      setHint("Enter a name without [ or ] characters.");
      return;
    }
    if (labels.includes(clean)) {
      setHint("That field already exists.");
      return;
    }
    persist([...labels, clean]);
    setNewLabel("");
  }

  function removeField(label: string) {
    persist(labels.filter((l) => l !== label));
  }

  return (
    <div className="rounded-xl border border-violet-900/40 bg-violet-950/15">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
      >
        <div>
          <span className="text-sm font-semibold text-slate-100">
            Custom merge fields
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            Define reusable placeholders, then insert{" "}
            <code className="text-violet-400/90">[Field name]</code> into subject or message. Values
            are filled in <strong className="text-slate-400">Dynamic fields</strong> below.
          </p>
        </div>
        <span className="text-slate-500" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-violet-900/35 px-4 pb-4 pt-2 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-1">
              <span className="text-xs font-medium text-slate-400">
                New field name
              </span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addField();
                  }
                }}
                placeholder="e.g. Company, Job ID, Hiring manager"
                className={inputClass}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              onClick={addField}
              className="shrink-0 rounded-lg border border-violet-600/50 bg-violet-700/40 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-600/50"
            >
              Add field
            </button>
          </div>
          {hint && (
            <p className="text-xs text-amber-300/90">{hint}</p>
          )}

          {labels.length === 0 ? (
            <p className="text-xs text-slate-500">
              No custom fields yet. Add names you reuse across campaigns; each becomes a{" "}
              <code className="rounded bg-violet-950/80 px-1 text-violet-200/90">[token]</code> you
              can insert anywhere.
            </p>
          ) : (
            <ul className="space-y-2">
              {labels.map((label) => {
                const token = labelToBracketToken(label);
                return (
                  <li
                    key={label}
                    className="flex flex-col gap-2 rounded-lg border border-violet-900/40 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="font-mono text-xs text-violet-400/90">{token}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onInsertSubject(token)}
                        className="rounded-md border border-blue-800/50 bg-blue-950/50 px-2.5 py-1.5 text-[11px] font-medium text-blue-200 hover:bg-blue-900/50"
                      >
                        Insert in subject
                      </button>
                      <button
                        type="button"
                        onClick={() => onInsertMessage(token)}
                        className="rounded-md border border-emerald-900/50 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-900/40"
                      >
                        Insert in message
                      </button>
                      <button
                        type="button"
                        onClick={() => removeField(label)}
                        className="rounded-md border border-red-900/40 px-2.5 py-1.5 text-[11px] font-medium text-red-300/90 hover:bg-red-950/40"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
