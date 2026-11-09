import { ChevronLeft, ChevronRight } from '@/components/icons';

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

// Numéros affichés : première, dernière, et deux pages autour de la courante ("…" pour les trous).
function visiblePages(page: number, pageCount: number): (number | '…')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? (['…', p] as const) : [p]));
}

export default function TablePagination({ page, pageCount, total, pageSize, onPageChange }: Props) {
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const button = 'h-8 min-w-8 px-2 inline-flex items-center justify-center border border-border font-body text-sm transition-colors';

  return (
    <nav aria-label="Pagination" className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3">
      <p className="font-body text-xs text-muted-foreground">
        {from}–{to} sur {total}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Page précédente"
          className={`${button} text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {visiblePages(page, pageCount).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <button key={p} type="button" onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}
              className={`${button} ${p === page ? 'bg-primary text-primary-foreground border-primary' : 'text-foreground hover:bg-muted'}`}>
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Page suivante"
          className={`${button} text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
