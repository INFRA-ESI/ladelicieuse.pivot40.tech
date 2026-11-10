import { useLocation, useNavigate } from 'react-router-dom';
import { parentPath, showsBackButton } from '@/lib/backNavigation';

// Revient à la page précédente de l'application ; si l'on est arrivé directement sur cette page, à sa page « parente ».
export function useBack() {
  const { pathname, key } = useLocation();
  const navigate = useNavigate();
  return {
    visible: showsBackButton(pathname),
    goBack: () => (key !== 'default' ? navigate(-1) : navigate(parentPath(pathname), { replace: true })),
  };
}
