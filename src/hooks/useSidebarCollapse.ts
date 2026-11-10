import { useCallback, useSyncExternalStore } from 'react';
import { ls } from '@/lib/storage';

const CHANGE_EVENT = 'sidebar-collapse-change';
const WIDE = '(min-width: 1024px)';

// Barre latérale réductible. Le choix du visiteur est mémorisé ; sans choix, elle est réduite
// sur tablette (moins de 1024 px) pour laisser la place au contenu, et ouverte au-delà.
export function useSidebarCollapse(storageKey: string): [boolean, () => void] {
  const read = useCallback((): boolean => {
    const saved = ls.get(storageKey);
    if (saved === 'collapsed') return true;
    if (saved === 'expanded') return false;
    return !window.matchMedia(WIDE).matches;
  }, [storageKey]);

  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(WIDE);
    window.addEventListener(CHANGE_EVENT, notify);
    window.addEventListener('storage', notify);
    media.addEventListener('change', notify);
    return () => {
      window.removeEventListener(CHANGE_EVENT, notify);
      window.removeEventListener('storage', notify);
      media.removeEventListener('change', notify);
    };
  }, []);

  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  const toggle = useCallback(() => {
    ls.set(storageKey, read() ? 'expanded' : 'collapsed');
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [storageKey, read]);

  return [collapsed, toggle];
}
