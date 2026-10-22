"use client";

import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function ListPagination({
  page,
  pageSize,
  total,
  totalPages,
  disabled,
  onPageChange,
  onPageSizeChange,
}: Props) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-xs text-[var(--color-ink-muted)]">
        Showing <span className="font-semibold text-[var(--color-ink)]">{from}–{to}</span> of{" "}
        <span className="font-semibold text-[var(--color-ink)]">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          Per page
          <select
            className="rounded-lg border border-[var(--color-line)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-ink)]"
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="ui-btn ui-btn-ghost !px-2.5 !py-1.5 text-xs"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
          >
            «
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost !px-2.5 !py-1.5 text-xs"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            Prev
          </button>
          <span className="min-w-[5.5rem] px-2 text-center text-xs tabular-nums text-[var(--color-ink)]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn-ghost !px-2.5 !py-1.5 text-xs"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            Next
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost !px-2.5 !py-1.5 text-xs"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
