"use client";

import { useMemo, useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import {
  openingsToCsv,
  parseWhatsappChat,
  type OpeningRow,
} from "@/lib/openings/parse-chat";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/lib/pagination";

export function OpeningsImport() {
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [emailsOnly, setEmailsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const visible = useMemo(
    () => (emailsOnly ? rows.filter((row) => row.emails) : rows),
    [emailsOnly, rows],
  );
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function onFile(file: File | null) {
    setError("");
    setRows([]);
    setMessageCount(0);
    setFileName("");
    if (!file) return;
    const text = await file.text();
    const parsed = parseWhatsappChat(text, file.name);
    if (parsed.messageCount === 0) {
      setError("This file does not look like a WhatsApp chat export.");
      return;
    }
    setFileName(file.name);
    setMessageCount(parsed.messageCount);
    setPage(1);
    setRows(parsed.rows);
  }

  function download() {
    const csv = openingsToCsv(visible);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const base = fileName.replace(/\.txt$/i, "") || "openings";
    link.href = url;
    link.download = `${base}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const withEmail = rows.filter((row) => row.emails).length;
  const withCompany = rows.filter((row) => row.companyName).length;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <label className="ui-dropzone">
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-semibold text-[var(--color-ink)]">
          {fileName ? "Replace chat export" : "Drop a WhatsApp .txt export"}
        </span>
        <span className="text-xs text-[var(--color-ink-muted)]">
          One row per job message. Email, role, experience, location, and company when the post includes them.
        </span>
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {fileName && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              <span className="font-semibold text-[var(--color-ink)]">{rows.length}</span> openings
              from {messageCount} messages. {withEmail} {withEmail === 1 ? "has" : "have"} an email.
              Company name was found on {withCompany}.
            </p>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              onClick={download}
              disabled={visible.length === 0}
            >
              Download CSV
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <input
              type="checkbox"
              checked={emailsOnly}
              onChange={(event) => {
                setEmailsOnly(event.target.checked);
                setPage(1);
              }}
            />
            Only rows that have an email
          </label>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="min-w-[760px] w-full text-left text-xs">
              <thead className="bg-[#f4f7f8] text-[var(--color-ink-muted)]">
                <tr>
                  {["Role", "Company", "Experience", "Location", "Email"].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={`${row.date}-${row.time}-${row.emails}-${index}`} className="border-t border-[var(--color-line)]">
                    <td className="max-w-[220px] px-3 py-2 align-top">{row.role || "—"}</td>
                    <td className="max-w-[180px] px-3 py-2 align-top">{row.companyName || "—"}</td>
                    <td className="px-3 py-2 align-top">{row.experience || "—"}</td>
                    <td className="px-3 py-2 align-top">{row.location || "—"}</td>
                    <td className="max-w-[220px] px-3 py-2 align-top break-all">{row.emails || "—"}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[var(--color-ink-muted)]">
                      No openings matched this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={currentPage}
            pageSize={pageSize}
            total={visible.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              const next = PAGE_SIZE_OPTIONS.includes(size as PageSize) ? (size as PageSize) : 10;
              setPageSize(next);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
