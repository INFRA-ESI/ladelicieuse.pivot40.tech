import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Mail, Eye, EyeOff, Loader2 } from '@/components/icons';
import { adminGet, adminPost } from '@/services/adminApiService';
import { ls } from '@/lib/storage';

type Step = 'form' | 'code';

const input = 'w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary';
const label = 'font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2';

// Adresse de connexion du back-office : c'est là que partent les codes d'accès. Pour la changer il faut le mot de passe actuel,
// puis le code reçu sur la NOUVELLE adresse — une faute de frappe ne peut donc pas verrouiller l'accès.
export default function AdminEmailSection() {
  const [current, setCurrent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [nouvelEmail, setNouvelEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminGet<{ data: { email: string } }>('/settings/email', { ttl: 0 })
      .then(res => setCurrent(res.data.email))
      .catch(() => setCurrent(null));
  }, []);

  const close = () => { setOpen(false); setStep('form'); setNouvelEmail(''); setMotDePasse(''); setCode(''); setShowPassword(false); };

  const sendCode = async () => {
    if (!nouvelEmail.trim() || !motDePasse) { toast.error('Renseignez la nouvelle adresse et votre mot de passe'); return; }
    setBusy(true);
    try {
      await adminPost('/settings/email/request', { nouvelEmail: nouvelEmail.trim(), motDePasse });
      setMotDePasse('');
      setStep('code');
      toast.success(`Code envoyé à ${nouvelEmail.trim().toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { toast.error('Le code compte 6 chiffres'); return; }
    setBusy(true);
    try {
      const res = await adminPost<{ data: { email: string } }>('/settings/email/confirm', { code });
      setCurrent(res.data.email);
      // L'en-tête du back-office lit l'adresse gardée à la connexion.
      try {
        const saved = JSON.parse(ls.get('admin_user') ?? 'null');
        if (saved) ls.set('admin_user', JSON.stringify({ ...saved, email: res.data.email }));
      } catch { /* valeur illisible : l'adresse sera relue à la prochaine connexion */ }
      toast.success('Adresse de connexion mise à jour');
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted rounded-md font-body text-sm text-foreground hover:bg-muted/80 transition-colors text-left"
      >
        <Mail className="w-4 h-4 text-primary shrink-0" />
        <span className="min-w-0">
          Changer l'adresse e-mail de connexion
          {current && <span className="block text-xs text-muted-foreground truncate">Actuelle : {current}</span>}
        </span>
      </button>
      <p className="font-body text-xs text-muted-foreground px-1">
        Les codes de connexion et les liens de réinitialisation sont envoyés à cette adresse. Un message de confirmation part aussi vers l'ancienne adresse.
      </p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-email-title">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-5">
            <h3 id="admin-email-title" className="font-display text-xl text-foreground">Adresse e-mail de connexion</h3>

            {step === 'form' ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="admin-new-email" className={label}>Nouvelle adresse e-mail</label>
                  <input id="admin-new-email" type="email" autoComplete="email" value={nouvelEmail} onChange={e => setNouvelEmail(e.target.value)} className={input} />
                </div>
                <div>
                  <label htmlFor="admin-email-password" className={label}>Mot de passe actuel</label>
                  <div className="relative">
                    <input
                      id="admin-email-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={motDePasse}
                      onChange={e => setMotDePasse(e.target.value)}
                      className={`${input} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="font-body text-xs text-muted-foreground">Un code à 6 chiffres sera envoyé à la nouvelle adresse pour confirmer qu'elle est bien la vôtre.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="font-body text-sm text-muted-foreground">
                  Saisissez le code envoyé à <strong className="text-foreground">{nouvelEmail.trim().toLowerCase()}</strong>. Il est valable 10 minutes.
                </p>
                <div>
                  <label htmlFor="admin-email-code" className={label}>Code de confirmation</label>
                  <input
                    id="admin-email-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    className={`${input} tracking-[0.5em] text-center text-lg`}
                  />
                </div>
                <button type="button" onClick={() => { setStep('form'); setCode(''); }} className="font-body text-xs text-primary hover:underline">
                  Renvoyer un code ou corriger l'adresse
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={close} className="flex-1 h-10 border border-border rounded-md font-body text-sm text-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={step === 'form' ? sendCode : confirm}
                disabled={busy}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-md font-body text-sm hover:bg-primary/90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {step === 'form' ? 'Envoyer le code' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
