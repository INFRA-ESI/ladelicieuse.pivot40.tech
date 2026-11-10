import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { PAGE_SIZE_OPTIONS } from '@/hooks/usePagination';

interface Props {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Absent = pas de choix du nombre de lignes. */
  setPageSize?: (size: number) => void;
}

// Numéros affichés : première, dernière, et deux pages autour de la courante ("…" pour les trous).
function visiblePages(page: number, pageCount: number): (number | '…')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? (['…', p] as const) : [p]));
}

const step = 'h-11 sm:h-9 inline-flex items-center justify-center gap-1 border border-border font-body text-sm transition-colors text-foreground hover:bg-muted active:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

export default function TablePagination({ page, pageCount, total, pageSize, onPageChange, setPageSize }: Props) {
  const nav = useRef<HTMLElement>(null);
  if (total <= PAGE_SIZE_OPTIONS[0]) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Après un changement de page, on remonte au début de la liste si on l'a dépassé (sur téléphone, la pagination est tout en bas).
  const go = (target: number) => {
    onPageChange(target);
    requestAnimationFrame(() => {
      const list = nav.current?.previousElementSibling;
      if (list instanceof HTMLElement && list.getBoundingClientRect().top < 64) {
        list.style.scrollMarginTop = '5rem';
        list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  };

  return (
    <nav ref={nav} aria-label="Pagination" className="flex flex-col gap-3 px-1 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center justify-between gap-3 lg:justify-start lg:gap-4">
        <p className="font-body text-xs text-muted-foreground">{from}–{to} sur {total}</p>
        {setPageSize && (
          <label className="flex items-center gap-2 font-body text-xs text-muted-foreground">
            Lignes
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="h-9 border border-border bg-background px-2 font-body text-sm text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Téléphone : précédent / page courante / suivant, grands boutons faciles à toucher */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:hidden">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={`${step} px-3`}>
          <ChevronLeft className="w-4 h-4" />Précédent
        </button>
        <span className="font-body text-sm text-foreground px-2 tabular-nums">{page} / {pageCount}</span>
        <button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} className={`${step} px-3`}>
          Suivant<ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Tablette et ordinateur : numéros de pages */}
      <div className="hidden sm:flex items-center gap-1 sm:justify-center lg:justify-end">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Page précédente" className={`${step} min-w-9 px-2`}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {visiblePages(page, pageCount).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <button key={p} type="button" onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}
              className={`${step} min-w-9 px-2 ${p === page ? 'bg-primary text-primary-foreground border-primary hover:bg-primary' : ''}`}>
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Page suivante" className={`${step} min-w-9 px-2`}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}
