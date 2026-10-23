"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { OpeningRow } from "@/lib/openings/parse-chat";

type Field = {
  label: string;
  value: string;
};

const sectionsFor = (row: OpeningRow): { title: string; fields: Field[] }[] => [
  { title: "Role", fields: [{ label: "Job role / designation", value: row.role }] },
  { title: "Company", fields: [{ label: "Company name", value: row.companyName }] },
  { title: "Email", fields: [{ label: "Email address", value: row.emails }] },
  { title: "Experience", fields: [{ label: "Required experience", value: row.experience }] },
  {
    title: "Location",
    fields: [
      { label: "Job location", value: row.location },
      { label: "Work mode", value: row.workMode },
    ],
  },
  { title: "Salary", fields: [{ label: "Salary or CTC", value: row.salary }] },
  { title: "Skills", fields: [{ label: "Required skills and technologies", value: row.skills }] },
  { title: "Description", fields: [{ label: "Job description", value: row.description }] },
  {
    title: "Contact",
    fields: [
      { label: "Sender", value: row.sender },
      { label: "Contact phone", value: row.contactPhone },
    ],
  },
  {
    title: "Source",
    fields: [
      { label: "Date", value: row.date },
      { label: "Time", value: row.time },
      { label: "Source file", value: row.sourceFile },
    ],
  },
  {
    title: "Original message",
    fields: [{ label: "Full text from the chat", value: row.message }],
  },
];

function FieldBlock({ field }: { field: Field }) {
  const text = field.value.trim();
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
        {field.label}
      </p>
      {text ? (
        <p
          className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)] ${
            field.label === "Email address" ? "break-all" : "break-words"
          }`}
        >
          {text}
        </p>
      ) : (
        <p className="mt-1 text-sm italic text-[var(--color-ink-muted)]">Not Available</p>
      )}
    </div>
  );
}

export function OpeningDetailModal({ row, onClose }: { row: OpeningRow; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const title = row.role.trim() || row.companyName.trim() || "Job opening";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      data-overlay=""
      className="flex items-center justify-center p-4 sm:p-6"
      style={{ position: "fixed", inset: 0, zIndex: 500 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(21,32,43,0.5)] backdrop-blur-[2px]"
        aria-label="Close dialog backdrop"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(90dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(21,32,43,0.22)]">
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-line)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3
              id="opening-detail-title"
              className="font-display text-base font-semibold leading-snug text-[var(--color-ink)] sm:text-lg"
            >
              {title}
            </h3>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              {row.date} {row.time}
              {row.companyName.trim() ? ` · ${row.companyName.trim()}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-line)] bg-white text-base text-[var(--color-ink-muted)] transition hover:bg-[#f0f4f8] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {sectionsFor(row).map((section) => (
            <section key={section.title} className="rounded-xl border border-[var(--color-line)] bg-[#f8fafc] px-4 py-3">
              <h4 className="font-display text-sm font-semibold text-[var(--color-ink)]">{section.title}</h4>
              <div className="mt-3 space-y-3">
                {section.fields.map((field) => (
                  <FieldBlock key={field.label} field={field} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="flex shrink-0 justify-end border-t border-[var(--color-line)] px-4 py-3 sm:px-5">
          <button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
