import { useSidebarCollapse } from '@/hooks/useSidebarCollapse';
import { CLIENT_SIDEBAR_KEY } from '@/lib/sidebarKeys';

// Décalage du contenu à droite de la barre latérale du client, selon qu'elle est réduite ou non.
export function useAppNavOffset(): string {
  const [collapsed] = useSidebarCollapse(CLIENT_SIDEBAR_KEY);
  return collapsed ? 'md:pl-[4.5rem]' : 'md:pl-64';
}
