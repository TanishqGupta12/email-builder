export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function parsePageParams(
  searchParams: URLSearchParams,
  defaults: { page?: number; pageSize?: number } = {},
): { page: number; pageSize: number } {
  const rawPage = Number(searchParams.get("page") ?? defaults.page ?? 1);
  const rawSize = Number(searchParams.get("pageSize") ?? defaults.pageSize ?? 10);
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawSize as PageSize)
    ? (rawSize as PageSize)
    : ((defaults.pageSize as PageSize) ?? 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  return { page, pageSize };
}
