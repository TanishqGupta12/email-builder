"use client";

import { useMemo, useState } from "react";
import {
  type ReferralAudience,
  type ReferralChannel,
  templatesFor,
  type ReferralTemplate,
} from "@/lib/referral-templates";
import { extractPlaceholders } from "@/lib/bracket-placeholders";
import { PlaceholderFillModal } from "@/components/PlaceholderFillModal";

const LINKEDIN_DEFAULT_SUBJECT = "Referral request (edit for your situation)";

type Props = {
  onApply: (payload: { subject: string; bodyPlain: string }) => void;
};

export function ReferralTemplatePicker({ onApply }: Props) {
  const [channel, setChannel] = useState<ReferralChannel>("email");
  const [audience, setAudience] = useState<ReferralAudience>("fresher");
  const [open, setOpen] = useState(true);
  const [fillModal, setFillModal] = useState<{
    subject: string;
    bodyPlain: string;
  } | null>(null);

  const list = useMemo(
    () => templatesFor(channel, audience),
    [channel, audience],
  );

  function onApplyTemplate(t: ReferralTemplate) {
    const subject =
      t.subject?.trim() ||
      (channel === "linkedin" ? LINKEDIN_DEFAULT_SUBJECT : "Referral request");
    const bodyPlain = t.body;
    if (extractPlaceholders(subject, bodyPlain).length === 0) {
      onApply({ subject, bodyPlain });
      return;
    }
    setFillModal({ subject, bodyPlain });
  }

  return (
    <>
      <div className="rounded-xl border border-blue-900/45 bg-blue-950/20">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left sm:px-5"
        >
          <div>
            <span className="text-sm font-semibold text-slate-100">
              Referral & cold outreach templates
            </span>
            <p className="mt-0.5 text-xs text-slate-500">
              LinkedIn DM & email — freshers & experienced.{" "}
              <span className="text-emerald-500/90">[Fields]</span> can be filled in the next step
              or under Dynamic fields.
            </p>
          </div>
          <span className="text-slate-500" aria-hidden>
            {open ? "▼" : "▶"}
          </span>
        </button>

        {open && (
          <div className="space-y-4 border-t border-blue-900/40 px-4 pb-4 pt-2 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <span className="w-full text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Channel
              </span>
              {(
                [
                  ["email", "Cold email"],
                  ["linkedin", "LinkedIn DM"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChannel(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    channel === id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-950/40"
                      : "border border-blue-800/50 bg-blue-950/40 text-slate-300 hover:bg-blue-900/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="w-full text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Audience
              </span>
              {(
                [
                  ["fresher", "Entry-level / internship"],
                  ["experienced", "Experienced"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAudience(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    audience === id
                      ? "bg-blue-600 text-white shadow-md shadow-blue-950/40"
                      : "border border-blue-800/50 bg-blue-950/40 text-slate-300 hover:bg-blue-900/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col rounded-lg border border-blue-900/50 bg-slate-950/40 p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-slate-100">
                      Template {t.variant} — {t.title}
                    </p>
                    <p className="text-xs text-slate-500">{t.hint}</p>
                    {t.subject && (
                      <p
                        className="truncate text-[11px] text-blue-300/90"
                        title={t.subject}
                      >
                        Subject: {t.subject}
                      </p>
                    )}
                    {channel === "linkedin" && (
                      <p className="text-[11px] text-slate-600">
                        Email subject: a short default is used — edit if needed.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyTemplate(t)}
                    className="mt-3 w-full rounded-lg border border-blue-600/50 bg-blue-600/25 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-600/40"
                  >
                    Use this template
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <PlaceholderFillModal
        open={fillModal !== null}
        pending={fillModal}
        onClose={() => setFillModal(null)}
        onConfirm={(filled) => {
          onApply(filled);
        }}
      />
    </>
  );
}
