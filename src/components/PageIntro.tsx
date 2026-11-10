import type { ReactNode } from 'react';

// En-tête compact des pages vues par un client connecté : à la place du grand visuel d'accueil, le titre et les actions tout de suite.
export const introPrimaryClass =
  'inline-flex items-center font-body text-sm px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl';
export const introSecondaryClass =
  'inline-flex items-center font-body text-sm px-6 py-3 border border-border text-foreground hover:bg-muted transition-colors rounded-xl';

interface PageIntroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Page sans marge haute propre : l'espace de l'ancienne barre du haut (5 rem) est repris par la mise en page connectée, on le rend ici. */
  clearBar?: boolean;
}

export default function PageIntro({ eyebrow, title, subtitle, actions, clearBar }: PageIntroProps) {
  return (
    <header className={`max-w-5xl mx-auto px-6 md:px-12 pb-8 ${clearBar ? 'pt-[7.5rem] md:pt-32' : 'pt-10 md:pt-12'}`}>
      {eyebrow && <p className="font-body text-xs text-primary mb-2">{eyebrow}</p>}
      <h1 className="font-display text-3xl md:text-5xl text-foreground leading-tight">{title}</h1>
      {subtitle && <p className="font-body text-base md:text-lg text-muted-foreground mt-2 max-w-2xl">{subtitle}</p>}
      {actions && <div className="flex flex-wrap items-center gap-3 mt-5">{actions}</div>}
    </header>
  );
}
