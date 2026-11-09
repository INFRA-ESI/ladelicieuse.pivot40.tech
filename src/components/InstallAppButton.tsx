import { Download } from '@/components/icons';
import { toast } from 'sonner';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

interface InstallAppButtonProps {
  className?: string;
}

// Bouton d'installation PWA, autonome et réutilisable : ne se rend que lorsque le
// navigateur a réellement proposé l'invite d'installation (Chrome/Edge Android & desktop).
// Se place où on veut (header, footer, bannière…) sans logique supplémentaire.
export default function InstallAppButton({ className = '' }: InstallAppButtonProps) {
  const { canInstall, promptInstall } = useInstallPrompt();

  if (!canInstall) return null;

  const handleClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success('Application installée');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Installer l'application La Délicieuse Diète"
      className={`group inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-body text-sm font-semibold shadow-md hover:shadow-lg hover:bg-primary/90 active:scale-[0.97] transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      <Download className="w-4 h-4 transition-transform duration-200 group-" aria-hidden="true" />
      Installer l'application
    </button>
  );
}
