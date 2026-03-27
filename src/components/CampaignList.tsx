"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  subject: string;
  senderEmail: string;
  status: string;
  createdAt: string;
  sent: number;
  failed: number;
  pending: number;
};

export function CampaignList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/campaigns");
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(true);
            setRows([]);
          }
          return;
        }
        const data = await res.json();
        const mapped: Row[] = (data.campaigns as {
          id: string;
          subject: string;
          senderEmail: string;
          status: string;
          createdAt: string;
          sent: number;
          failed: number;
          pending: number;
        }[]).map((c) => ({
          id: c.id,
          subject: c.subject,
          senderEmail: c.senderEmail,
          status: c.status,
          createdAt: c.createdAt,
          sent: c.sent,
          failed: c.failed,
          pending: c.pending,
        }));
        if (!cancelled) {
          setLoadError(false);
          setRows(mapped);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setRows([]);
        }
      }
    };
    void load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!rows) {
    return (
      <div className="h-32 animate-pulse bg-slate-950/40 px-4 py-6 sm:h-36 sm:px-6 sm:py-8">
        <div className="h-full rounded-lg bg-blue-950/20" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="px-4 py-8 text-center text-sm text-red-300/90 sm:px-6 sm:py-10">
        Could not load campaigns. Check that the app is running and try refreshing the page.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500 sm:px-6 sm:py-12">
        No campaigns yet. Send your first batch below.
      </p>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards */}
      <ul className="divide-y divide-blue-950/60 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-4">
            <p className="font-medium leading-snug text-slate-100">{r.subject}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{r.senderEmail}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-md border border-blue-800/60 bg-blue-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                {r.status}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 py-2">
                <div className="text-lg font-semibold tabular-nums text-emerald-400">{r.sent}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-500/80">
                  Sent
                </div>
              </div>
              <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 py-2">
                <div className="text-lg font-semibold tabular-nums text-amber-300">{r.pending}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-500/80">
                  Pending
                </div>
              </div>
              <div className="rounded-lg border border-red-900/40 bg-red-950/30 py-2">
                <div className="text-lg font-semibold tabular-nums text-red-400">{r.failed}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-red-400/80">
                  Failed
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* md+: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-blue-950/80 text-sm">
          <thead className="bg-blue-950/40">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                Subject
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                From
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                Status
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                Sent
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                Pending
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                Failed
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-blue-200/80 lg:px-4">
                When
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-950/60">
            {rows.map((r) => (
              <tr key={r.id} className="transition hover:bg-blue-950/25">
                <td
                  className="max-w-[200px] truncate px-3 py-3 font-medium text-slate-100 lg:px-4"
                  title={r.subject}
                >
                  {r.subject}
                </td>
                <td className="max-w-[180px] truncate px-3 py-3 text-slate-400 lg:px-4">
                  {r.senderEmail}
                </td>
                <td className="px-3 py-3 lg:px-4">
                  <span className="inline-flex rounded-md border border-blue-800/60 bg-blue-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-emerald-400 lg:px-4">{r.sent}</td>
                <td className="px-3 py-3 text-right tabular-nums text-amber-300/90 lg:px-4">
                  {r.pending}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-red-400 lg:px-4">{r.failed}</td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-500 lg:px-4">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
