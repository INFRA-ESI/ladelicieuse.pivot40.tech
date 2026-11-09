import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowRight, CheckCircle, ArrowLeft } from '@/components/icons';
import Footer from '@/components/Footer';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Veuillez entrer votre adresse email.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/client/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la demande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-background pt-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link
          to="/connexion"
          className="inline-flex items-center gap-1.5 font-body text-xs text-muted-foreground hover:text-primary transition-colors mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à la connexion
        </Link>

        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-6"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display text-3xl text-foreground mb-3">Email envoyé</h2>
            <p className="font-body text-sm text-muted-foreground mb-2 leading-relaxed">
              Si un compte correspond à
            </p>
            <p className="font-body text-sm font-medium text-foreground mb-6">{email}</p>
            <div className="bg-muted/50 border border-border rounded-xl px-5 py-4 mb-8 flex items-start gap-3 text-left">
              <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="font-body text-xs text-muted-foreground leading-relaxed">
                Vous recevrez un lien valable <strong>1 heure</strong> pour réinitialiser votre mot de passe. Pensez à vérifier vos spams.
              </p>
            </div>
            <Link
              to="/connexion"
              className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
            >
              Retour à la connexion <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        ) : (
          <>
            <span className="font-body text-xs text-primary block mb-3">
              Récupération
            </span>
            <h1 className="font-display text-4xl md:text-5xl text-foreground leading-[0.95] mb-3">
              Mot de passe<br /><span>oublié ?</span>
            </h1>
            <p className="font-body text-sm text-muted-foreground mb-8 leading-relaxed">
              Entrez votre adresse email et nous vous enverrons un lien pour créer un nouveau mot de passe.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <label className="font-body text-xs text-muted-foreground block mb-2">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                  className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                />
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
                {loading ? 'Envoi…' : <><span>Envoyer le lien</span><ArrowRight className="w-4 h-4" /></>}
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
