// Page vers laquelle « Retour » ramène quand l'historique du navigateur n'a rien avant (lien ouvert directement,
// page rechargée, application installée). Les pages de premier niveau reviennent à l'accueil.
export function parentPath(pathname: string): string {
  const [, section, child] = pathname.split('/');
  if (child && (section === 'composer' || section === 'jus' || section === 'repas')) return `/${section}`;
  return '/';
}

/** L'accueil n'a pas de page précédente à proposer. */
export const showsBackButton = (pathname: string): boolean => pathname !== '/';
