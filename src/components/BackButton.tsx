import { useBack } from '@/hooks/useBack';
import { ChevronLeft } from '@/components/icons';
import { cn } from '@/lib/utils';

// Bouton rond avec la flèche, pour l'intégrer dans une barre existante (barre du haut du visiteur).
export function BackIconButton({ className }: { className?: string }) {
  const { visible, goBack } = useBack();
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Retour"
      className={cn('flex items-center justify-center w-10 h-10 rounded-xl border border-border text-foreground shrink-0 active:bg-muted transition-colors', className)}
    >
      <ChevronLeft className="w-5 h-5" />
    </button>
  );
}

// Barre fine collée en haut sur téléphone et tablette quand le client est connecté (il n'a plus de barre du haut).
export function BackBar({ className }: { className?: string }) {
  const { visible, goBack } = useBack();
  if (!visible) return null;
  return (
    <div className={cn('lg:hidden sticky top-0 z-30 h-11 flex items-center px-2 bg-background/90 backdrop-blur border-b border-border', className)}>
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1 h-10 pl-1 pr-3 rounded-xl font-body text-sm text-foreground active:bg-muted transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        Retour
      </button>
    </div>
  );
}
