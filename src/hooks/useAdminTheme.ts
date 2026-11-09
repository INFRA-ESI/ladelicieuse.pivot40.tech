import { useEffect } from 'react';

const ADMIN_THEME_CLASS = 'admin-square';

/** Applique l'identité carrée du back-office tant que le composant est affiché, puis la retire. */
export function useAdminTheme(): void {
  useEffect(() => {
    document.body.classList.add(ADMIN_THEME_CLASS);
    return () => document.body.classList.remove(ADMIN_THEME_CLASS);
  }, []);
}
