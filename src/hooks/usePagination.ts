import { useCallback, useEffect, useMemo, useState } from 'react';
import { ls } from '@/lib/storage';

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const PAGE_SIZE_KEY = 'ladelicieuse_page_size';

const storedSize = (fallback: number): number => {
  const saved = Number(ls.get(PAGE_SIZE_KEY));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(saved) ? saved : fallback;
};

/**
 * Découpe une liste en pages. `resetKey` ramène à la page 1 quand il change
 * (filtres, recherche, tri) ; si la liste rétrécit, la page courante est ramenée dans les bornes.
 * Le nombre de lignes par page est au choix de l'administrateur et retenu d'une page à l'autre.
 */
export function usePagination<T>(items: T[], resetKey: unknown = null, defaultPageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(() => storedSize(defaultPageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const setPageSize = useCallback((size: number) => {
    ls.set(PAGE_SIZE_KEY, String(size));
    setSize(size);
    setPage(1);
  }, []);

  const current = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return { page: current, setPage, pageCount, pageItems, total: items.length, pageSize, setPageSize };
}
