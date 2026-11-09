import { useEffect, useMemo, useState } from 'react';

export const PAGE_SIZE = 10;

/**
 * Découpe une liste en pages. `resetKey` ramène à la page 1 quand il change
 * (filtres, recherche, tri) ; si la liste rétrécit, la page courante est ramenée dans les bornes.
 */
export function usePagination<T>(items: T[], resetKey: unknown = null, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return { page: current, setPage, pageCount, pageItems, total: items.length, pageSize };
}
