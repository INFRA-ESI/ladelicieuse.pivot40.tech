import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, CheckCircle, AlertTriangle } from '@/components/icons';
import Footer from '@/components/Footer';
import { PASSWORD_HINT, passwordError } from '@/lib/password';

export default function ResetPasswordPage() {
  const [searchParams]        = useSearchParams();
  const token                 = searchParams.get('token') || '';

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password || !confirm) { setError('Remplissez les deux champs.'); return; }
    const pwdError = passwordError(password);
    if (pwdError) { setError(pwdError); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/client/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la réinitialisation.');
    } finally {
      setLoading(false);
    }
  };

  const eyeBtn = (
    <button type="button" onClick={() => setShowPwd(p => !p)} className="text-muted-foreground hover:text-foreground transition-colors">
      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  if (!token) {
    return (
      <>
      <div className="min-h-screen flex items-center justify-center px-6 pt-24">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="font-display text-2xl text-foreground mb-3">Lien invalide</h2>
          <p className="font-body text-sm text-muted-foreground mb-6">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link
            to="/mot-de-passe-oublie"
            className="inline-flex items-center gap-2 font-body text-sm px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
          >
            Demander un nouveau lien <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
      <Footer />
      </>
    );
  }

  return (
    <>
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-background pt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display text-3xl text-foreground mb-3">Mot de passe mis à jour</h2>
            <p className="font-body text-sm text-muted-foreground mb-8 leading-relaxed">
              Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
            </p>
            <Link
              to="/connexion"
              className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
            >
              Se connecter <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        ) : (
          <>
            <span className="font-body text-xs text-primary block mb-3">
              Sécurité
            </span>
            <h1 className="font-display text-4xl md:text-5xl text-foreground leading-[0.95] mb-3">
              Nouveau<br /><span>mot de passe</span>
            </h1>
            <p className="font-body text-sm text-muted-foreground mb-8 leading-relaxed">
              Choisissez un mot de passe sécurisé : {PASSWORD_HINT}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="font-body text-xs text-muted-foreground block mb-2">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="8 caractères, une majuscule, un chiffre"
                    autoComplete="new-password"
                    className="w-full font-body text-sm px-4 py-3.5 pr-12 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">{eyeBtn}</div>
                </div>
              </div>

              <div>
                <label className="font-body text-xs text-muted-foreground block mb-2">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    autoComplete="new-password"
                    className="w-full font-body text-sm px-4 py-3.5 pr-12 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">{eyeBtn}</div>
                </div>
              </div>

              {error && (
                <p className="font-body text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors rounded-xl"
              >
                {loading ? 'Mise à jour…' : <><span>Enregistrer le mot de passe</span><ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
    <Footer />
    </>
  );
}
