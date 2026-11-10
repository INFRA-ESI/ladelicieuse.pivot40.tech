import { useCallback, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { dietConflicts, type DietSubject } from '@/lib/dietary';

// Les préférences du compte appliquées à une liste de produits : on signale ce qui ne convient pas, et par défaut on le masque.
export function useDietFilter() {
  const { preferences } = useUser();
  const [hide, setHide] = useState(true);
  const active = preferences.length > 0;
  const conflictsOf = useCallback((subject: DietSubject) => dietConflicts(subject, preferences), [preferences]);
  const keep = useCallback((subject: DietSubject) => !(active && hide && dietConflicts(subject, preferences).length > 0), [active, hide, preferences]);
  return { preferences, active, hide, setHide, conflictsOf, keep };
}
