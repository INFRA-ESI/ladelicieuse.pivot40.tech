import { Bell, Loader2 } from '@/components/icons';
import { usePushNotifications, type PushAudience } from '@/hooks/usePushNotifications';

const COPY: Record<PushAudience, { title: string; intro: string }> = {
  client: {
    title: 'Notifications de commande',
    intro: 'Soyez prévenu à chaque étape : commande confirmée, en préparation, prête, livrée ou prête à retirer.',
  },
  admin: {
    title: 'Alertes de nouvelles commandes',
    intro: 'Recevez une alerte sur cet appareil dès qu\'une commande arrive, même lorsque le back-office est fermé. À activer sur chaque appareil de l\'équipe.',
  },
};

const buttonBase = 'min-h-11 px-5 rounded-xl font-body text-sm transition-colors disabled:opacity-60 disabled:cursor-wait inline-flex items-center justify-center gap-2';

// Bouton explicite « Activer les notifications » : l'autorisation n'est demandée qu'au toucher de l'utilisateur.
// Sur iPhone/iPad, le site doit d'abord être ajouté à l'écran d'accueil (condition d'Apple pour les notifications web).
export default function PushNotificationsCard({ audience }: { audience: PushAudience }) {
  const { availability, subscribed, busy, error, enable, disable } = usePushNotifications(audience);
  const copy = COPY[audience];

  return (
    <section aria-labelledby={`push-${audience}-title`} className="rounded-2xl border border-border bg-background p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 id={`push-${audience}-title`} className="font-display text-lg text-foreground">{copy.title}</h3>
          <p className="font-body text-sm text-muted-foreground mt-0.5 leading-relaxed">{copy.intro}</p>
        </div>
      </div>

      <div className="mt-4">
        {availability === 'ios-install' && (
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="font-body text-sm text-foreground">Sur iPhone et iPad, ajoutez d'abord le site à l'écran d'accueil.</p>
            <ol className="mt-2 space-y-1.5 font-body text-sm text-muted-foreground list-decimal pl-5">
              <li>Dans Safari, touchez le bouton Partager.</li>
              <li>Choisissez « Sur l'écran d'accueil », puis Ajouter.</li>
              <li>Ouvrez La Délicieuse Diète depuis son icône, revenez sur cette page et touchez « Activer les notifications ».</li>
            </ol>
            <p className="mt-2 font-body text-xs text-muted-foreground">iOS 16.4 ou plus récent est nécessaire.</p>
          </div>
        )}

        {availability === 'unsupported' && (
          <p className="font-body text-sm text-muted-foreground">
            Ce navigateur ne prend pas en charge les notifications. Essayez avec Chrome, Edge, Firefox ou Safari à jour.
          </p>
        )}

        {availability === 'denied' && (
          <p className="font-body text-sm text-muted-foreground">
            Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (sur iPhone : Réglages, Notifications, La Délicieuse Diète), puis revenez ici.
          </p>
        )}

        {availability === 'ready' && !subscribed && (
          <button type="button" onClick={enable} disabled={busy} className={`${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Activer les notifications
          </button>
        )}

        {availability === 'ready' && subscribed && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-body text-sm text-primary" role="status">Activées sur cet appareil</p>
            <button type="button" onClick={disable} disabled={busy} className={`${buttonBase} border border-border text-foreground hover:bg-muted`}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Désactiver
            </button>
          </div>
        )}

        {error && <p role="alert" className="mt-3 font-body text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
