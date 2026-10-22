"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type CampaignReusePayload = {
  campaignId: string;
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  attachments: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[];
};

type CampaignFull = {
  id: string;
  senderEmail: string;
  subject: string;
  bodyHtml: string;
  status: string;
  createdAt: string;
  attachments: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  }[];
  recipients: { email: string; status: string; errorMessage: string | null }[];
};

type Props = {
  campaignId: string;
  onClose: () => void;
  onReuse: (payload: CampaignReusePayload) => void;
};

export function CampaignDetailModal({ campaignId, onClose, onReuse }: Props) {
  const [campaign, setCampaign] = useState<CampaignFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reusing, setReusing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCampaign(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? "Could not load campaign");
          return;
        }
        if (!cancelled) setCampaign(data.campaign as CampaignFull);
      } catch {
        if (!cancelled) setError("Network error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [onClose]);

  async function handleReuse() {
    if (!campaign) return;
    setReusing(true);
    try {
      onReuse({
        campaignId: campaign.id,
        senderEmail: campaign.senderEmail,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
        attachments: campaign.attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          mimeType: a.mimeType,
          size: a.size,
        })),
      });
      onClose();
    } finally {
      setReusing(false);
    }
  }

  const counts = campaign?.recipients.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const statusClass =
    campaign?.status === "COMPLETED"
      ? "ui-chip ui-chip-ok"
      : campaign?.status === "SENDING" || campaign?.status === "QUEUED"
        ? "ui-chip ui-chip-warn"
        : "ui-chip";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(21,32,43,0.5)] backdrop-blur-[2px]"
        aria-label="Close dialog backdrop"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_64px_rgba(21,32,43,0.22)] sm:rounded-2xl"
        style={{
          maxHeight: "min(90dvh, 720px)",
          height: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-line)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 pr-2">
              <h3
                id="campaign-detail-title"
                className="font-display text-base font-semibold leading-snug text-[var(--color-ink)] sm:text-lg"
              >
                {campaign?.subject ?? "Campaign"}
              </h3>
              {campaign && <span className={statusClass}>{campaign.status}</span>}
            </div>
            {campaign && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                {new Date(campaign.createdAt).toLocaleString()}
                {counts
                  ? ` · ${counts.SENT ?? 0} sent · ${counts.FAILED ?? 0} failed · ${counts.PENDING ?? 0} pending`
                  : ""}
              </p>
            )}
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

        {/* Scrollable body only */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {error && <div className="ui-alert ui-alert-error">{error}</div>}
          {!campaign && !error && (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef2f6]" />
              <div className="h-40 animate-pulse rounded-xl bg-[#eef2f6]" />
            </div>
          )}
          {campaign && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-[var(--color-line)] bg-[#f8fafc] px-4 py-3">
                <MetaRow label="From" value={campaign.senderEmail} />
                <MetaRow
                  label="To"
                  value={`${campaign.recipients.length} recipient${campaign.recipients.length === 1 ? "" : "s"}`}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Message
                </p>
                <div
                  className="campaign-html-preview rounded-xl border border-[var(--color-line)] bg-white px-4 py-4 text-sm leading-relaxed text-[var(--color-ink)]"
                  dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Attachments
                </p>
                {campaign.attachments.length === 0 ? (
                  <p className="text-sm text-[var(--color-ink-muted)]">No files attached</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {campaign.attachments.map((a) => (
                      <li key={a.id}>
                        <a
                          href={`/api/campaigns/${campaign.id}/attachments/${a.id}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-ink)] no-underline transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                        >
                          <span className="font-mono">{a.originalName}</span>
                          <span className="text-[var(--color-ink-muted)]">
                            {Math.max(1, Math.round(a.size / 1024))} KB
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fixed footer — always visible */}
        {campaign && (
          <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--color-line)] bg-white px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-[var(--color-ink-muted)]">
              Reuse loads this into Compose. Recipients stay empty.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost flex-1 sm:flex-none">
                Close
              </button>
              <button
                type="button"
                disabled={reusing}
                onClick={() => void handleReuse()}
                className="ui-btn ui-btn-primary flex-1 sm:flex-none"
              >
                {reusing ? "Loading…" : "Reuse in composer"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-3 text-sm">
      <span className="w-12 shrink-0 font-semibold text-[var(--color-ink-muted)]">{label}</span>
      <span className="min-w-0 break-all font-mono text-[var(--color-ink)]">{value}</span>
    </div>
  );
}
