"use client";

import { useMemo, useState } from "react";
import { ListPagination } from "@/components/ListPagination";
import { OpeningDetailModal } from "@/components/OpeningDetailModal";
import {
  EMPTY_OPENING_FILTERS,
  OPENING_COLUMNS,
  filterOpenings,
  filtersAreActive,
  type EmailPresence,
  type OpeningColumnKey,
  type OpeningFilters,
} from "@/lib/openings/filters";
import { openingsToCsv, parseWhatsappChat, type OpeningRow } from "@/lib/openings/parse-chat";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/lib/pagination";

const inputClass =
  "w-full rounded-lg border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]";

export function OpeningsImport() {
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<OpeningFilters>(EMPTY_OPENING_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [selected, setSelected] = useState<OpeningRow | null>(null);

  const visible = useMemo(() => filterOpenings(rows, filters), [filters, rows]);
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filtering = filtersAreActive(filters);

  function updateFilters(next: OpeningFilters) {
    setFilters(next);
    setPage(1);
  }

  function setText(key: OpeningColumnKey, value: string) {
    updateFilters({ ...filters, text: { ...filters.text, [key]: value } });
  }

  async function onFile(file: File | null) {
    setError("");
    setRows([]);
    setMessageCount(0);
    setFileName("");
    setFilters(EMPTY_OPENING_FILTERS);
    setSelected(null);
    setPage(1);
    if (!file) return;
    const text = await file.text();
    const parsed = parseWhatsappChat(text, file.name);
    if (parsed.messageCount === 0) {
      setError("This file does not look like a WhatsApp chat export.");
      return;
    }
    setFileName(file.name);
    setMessageCount(parsed.messageCount);
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
          One row per job message. Every extracted field is shown in the table and can be filtered.
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
              <span className="font-semibold text-[var(--color-ink)]">{visible.length}</span> of{" "}
              {rows.length} openings from {messageCount} messages. {withEmail}{" "}
              {withEmail === 1 ? "has" : "have"} an email. Company name was found on {withCompany}.
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

          <div className="rounded-lg border border-[var(--color-line)] bg-[#f7faf9] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Filters
              </p>
              <button
                type="button"
                className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs"
                onClick={() => updateFilters(EMPTY_OPENING_FILTERS)}
                disabled={!filtering}
              >
                Clear filters
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {OPENING_COLUMNS.map((column) => (
                <label key={column.key} className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-[var(--color-ink-muted)]">
                    {column.key === "date" ? "Date range" : column.label}
                  </span>
                  {column.key === "date" && (
                    <div className="grid grid-cols-2 gap-1">
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--color-ink-muted)]">From</span>
                        <input
                          className={inputClass}
                          type="date"
                          aria-label="From date"
                          value={filters.dateFrom}
                          onChange={(event) =>
                            updateFilters({ ...filters, dateFrom: event.target.value })
                          }
                        />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-[var(--color-ink-muted)]">To</span>
                        <input
                          className={inputClass}
                          type="date"
                          aria-label="To date"
                          value={filters.dateTo}
                          onChange={(event) =>
                            updateFilters({ ...filters, dateTo: event.target.value })
                          }
                        />
                      </span>
                    </div>
                  )}
                  {column.key === "emails" && (
                    <select
                      className={inputClass}
                      value={filters.emailPresence}
                      onChange={(event) =>
                        updateFilters({
                          ...filters,
                          emailPresence: event.target.value as EmailPresence,
                        })
                      }
                    >
                      <option value="any">Any email</option>
                      <option value="has">Has an email</option>
                      <option value="missing">No email</option>
                    </select>
                  )}
                  {column.key === "experience" && (
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder="Min years"
                        value={filters.experienceMin}
                        onChange={(event) =>
                          updateFilters({ ...filters, experienceMin: event.target.value })
                        }
                      />
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder="Max years"
                        value={filters.experienceMax}
                        onChange={(event) =>
                          updateFilters({ ...filters, experienceMax: event.target.value })
                        }
                      />
                    </div>
                  )}
                  {column.key !== "date" && (
                    <input
                      className={inputClass}
                      placeholder="Contains…"
                      value={filters.text[column.key] ?? ""}
                      onChange={(event) => setText(column.key, event.target.value)}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="w-max min-w-full text-left text-xs">
              <thead className="bg-[#f4f7f8] text-[var(--color-ink-muted)]">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-semibold">View</th>
                  {OPENING_COLUMNS.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr
                    key={`${row.date}-${row.time}-${row.sender}-${index}`}
                    className="border-t border-[var(--color-line)]"
                  >
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost !px-2.5 !py-1 text-xs"
                        onClick={() => setSelected(row)}
                      >
                        View
                      </button>
                    </td>
                    {OPENING_COLUMNS.map((column) => {
                      const value = row[column.key];
                      return (
                        <td
                          key={column.key}
                          className="max-w-[240px] px-3 py-2 align-top break-words"
                          title={value}
                        >
                          <span className="line-clamp-3">{value || "—"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={OPENING_COLUMNS.length + 1}
                      className="px-3 py-6 text-center text-[var(--color-ink-muted)]"
                    >
                      No openings matched these filters.
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
      {selected && <OpeningDetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
