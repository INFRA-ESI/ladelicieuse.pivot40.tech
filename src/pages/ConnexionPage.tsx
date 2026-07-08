import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/context/UserContext';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, Mail, CheckCircle, RefreshCw } from 'lucide-react';
import Footer from '@/components/Footer';

const HERO_IMG = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80';

type Tab = 'connexion' | 'inscription';

// ─── Champ de formulaire réutilisable ─────────────────────────────────────────
function Field({
  label, type = 'text', value, onChange, placeholder, autoComplete, suffix,
}: {
  label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  autoComplete?: string; suffix?: React.ReactNode;
}) {
  return (
    <div>
      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ConnexionPage() {
  const { loginWithPassword, registerAccount } = useUser();
  const navigate = useNavigate();

  const [tab, setTab]         = useState<Tab>('connexion');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // Connexion
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError,    setLoginError]    = useState('');

  // Inscription
  const [regPrenoms, setRegPrenoms] = useState('');
  const [regNom,     setRegNom]     = useState('');
  const [regEmail,   setRegEmail]   = useState('');
  const [regTel,     setRegTel]     = useState('');
  const [regPwd,     setRegPwd]     = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError,   setRegError]   = useState('');
  const [regSuccess,        setRegSuccess]        = useState('');
  const [resendingVerif,    setResendingVerif]    = useState(false);

  const switchTab = (t: Tab) => {
    setTab(t);
    setLoginError(''); setRegError(''); setRegSuccess('');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!loginEmail || !loginPassword) { setLoginError('Remplissez tous les champs.'); return; }
    setLoading(true);
    try {
      await loginWithPassword(loginEmail.trim().toLowerCase(), loginPassword);
      toast.success('Connexion réussie !');
      navigate('/mon-compte');
    } catch (err) {
      setLoginError((err as Error).message || 'Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError(''); setRegSuccess('');
    if (!regPrenoms.trim() || !regNom.trim() || !regEmail.trim() || !regPwd) {
      setRegError('Prénom(s), nom, email et mot de passe sont requis.');
      return;
    }
    if (regPwd.length < 8 || !/[A-Z]/.test(regPwd) || !/[0-9]/.test(regPwd) || !/[^a-zA-Z0-9]/.test(regPwd)) {
      setRegError('Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial (@, !, #, $...).');
      return;
    }
    if (regPwd !== regConfirm) { setRegError('Les mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    try {
      await registerAccount(regNom.trim(), regPrenoms.trim(), regEmail.trim().toLowerCase(), regPwd, regTel.trim() || undefined);
      setRegSuccess(regEmail.trim().toLowerCase());
      setRegPrenoms(''); setRegNom(''); setRegEmail(''); setRegTel(''); setRegPwd(''); setRegConfirm('');
    } catch (err) {
      setRegError((err as Error).message || "Erreur lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const eyeBtn = (
    <button type="button" onClick={() => setShowPwd(p => !p)} className="text-muted-foreground hover:text-foreground transition-colors">
      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <>
    <div className="min-h-screen flex flex-col md:flex-row pt-20">

      {/* ── Colonne gauche — Hero ── */}
      <div className="relative hidden md:flex md:w-1/2 flex-col justify-end overflow-hidden">
        <img
          src={HERO_IMG}
          alt="Salade fraîche La Délicieuse Diète"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-foreground/10" />

        <AnimatePresence mode="wait">
          {tab === 'connexion' ? (
            <motion.div
              key="hero-connexion"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="relative z-10 px-12 pb-16"
            >
              <span className="font-body text-xs uppercase tracking-[0.3em] text-primary mb-4 block">
                Votre espace membre
              </span>
              <h2 className="font-display text-5xl lg:text-6xl text-primary-foreground leading-[0.95] mb-5">
                Chaque repas,<br />
                <span className="italic">une intention</span>
              </h2>
              <p className="font-body text-primary-foreground/70 text-base max-w-xs leading-relaxed">
                Retrouvez vos commandes, vos points fidélité et vos abonnements en un seul endroit.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="hero-inscription"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="relative z-10 px-12 pb-16"
            >
              <span className="font-body text-xs uppercase tracking-[0.3em] text-primary mb-4 block">
                Rejoindre la famille
              </span>
              <h2 className="font-display text-5xl lg:text-6xl text-primary-foreground leading-[0.95] mb-5">
                Bien manger,<br />
                <span className="italic">c'est choisir</span>
              </h2>
              <p className="font-body text-primary-foreground/70 text-base max-w-xs leading-relaxed">
                Créez votre compte et accédez à des salades sur-mesure, des jus détox et un suivi nutritionnel pensé pour vous.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Colonne droite — Formulaire ── */}
      <div className="flex-1 md:w-1/2 flex flex-col justify-center px-6 md:px-12 lg:px-20 py-12 bg-background">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="w-full max-w-md mx-auto"
        >
          {/* Branding mobile */}
          <div className="md:hidden mb-8">
            <Link to="/" className="font-display text-2xl text-foreground">La Délicieuse Diète</Link>
          </div>

          {/* Titre */}
          <div className="mb-8">
            <span className="font-body text-xs uppercase tracking-[0.3em] text-primary block mb-3">
              {tab === 'connexion' ? 'Accès membre' : 'Rejoindre'}
            </span>
            <h1 className="font-display text-4xl md:text-5xl text-foreground leading-[0.95]">
              {tab === 'connexion' ? (
                <>Se<br /><span className="italic">connecter</span></>
              ) : (
                <>Créer mon<br /><span className="italic">compte</span></>
              )}
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mb-8 border-b border-border">
            {(['connexion', 'inscription'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`font-body text-xs uppercase tracking-[0.2em] pb-3 transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {t === 'connexion' ? 'Se connecter' : "S'inscrire"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── CONNEXION ── */}
            {tab === 'connexion' && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22 }}
                onSubmit={handleLogin}
                className="flex flex-col gap-5"
              >
                <Field label="Adresse email" type="email" value={loginEmail}
                  onChange={setLoginEmail} placeholder="vous@exemple.com" autoComplete="email" />
                <div>
                  <Field label="Mot de passe" type={showPwd ? 'text' : 'password'} value={loginPassword}
                    onChange={setLoginPassword} placeholder="••••••••" autoComplete="current-password" suffix={eyeBtn} />
                  <div className="text-right mt-1.5">
                    <Link to="/mot-de-passe-oublie" className="font-body text-xs text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline">
                      Mot de passe oublié ?
                    </Link>
                  </div>
                </div>

                {loginError && (
                  <p className="font-body text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors rounded-xl mt-1"
                >
                  {loading ? 'Connexion…' : <><span>Accéder à mon compte</span><ArrowRight className="w-4 h-4" /></>}
                </button>

                <p className="font-body text-sm text-muted-foreground text-center pt-1">
                  Pas encore de compte ?{' '}
                  <button type="button" onClick={() => switchTab('inscription')} className="text-primary hover:underline underline-offset-2">
                    S'inscrire
                  </button>
                </p>
              </motion.form>
            )}

            {/* ── INSCRIPTION ── */}
            {tab === 'inscription' && (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22 }}
              >
                {/* Succès */}
                {regSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-6"
                  >
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
                      <CheckCircle className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="font-display text-2xl text-foreground mb-3">Vérifiez votre email</h3>
                    <p className="font-body text-sm text-muted-foreground mb-2 leading-relaxed">
                      Un lien d'activation a été envoyé à
                    </p>
                    <p className="font-body text-sm font-medium text-foreground mb-6">{regSuccess}</p>
                    <div className="bg-muted/50 border border-border rounded-xl px-5 py-4 mb-6 flex items-start gap-3 text-left">
                      <Mail className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="font-body text-xs text-muted-foreground leading-relaxed">
                        Cliquez sur le lien dans l'email pour activer votre compte. Pensez à vérifier vos spams.
                      </p>
                    </div>
                    <button
                      disabled={resendingVerif}
                      onClick={async () => {
                        setResendingVerif(true);
                        try {
                          await fetch('/api/client/resend-verification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: regSuccess }),
                          });
                          toast.success('Email renvoyé !', { description: 'Vérifiez votre boîte mail et vos spams.' });
                        } catch {
                          toast.error('Erreur réseau', { description: 'Réessayez dans quelques instants.' });
                        } finally {
                          setResendingVerif(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 font-body text-sm px-6 py-3 border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors rounded-xl mb-3 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${resendingVerif ? 'animate-spin' : ''}`} />
                      {resendingVerif ? 'Envoi en cours…' : 'Renvoyer le lien de vérification'}
                    </button>
                    <button
                      onClick={() => switchTab('connexion')}
                      className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
                    >
                      Aller à la connexion <ArrowRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleRegister} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Prénom(s)" value={regPrenoms} onChange={setRegPrenoms} placeholder="Jean-Marie" autoComplete="given-name" />
                      <Field label="Nom" value={regNom} onChange={setRegNom} placeholder="DUPONT" autoComplete="family-name" />
                    </div>
                    <Field label="Adresse email" type="email" value={regEmail} onChange={setRegEmail}
                      placeholder="vous@exemple.com" autoComplete="email" />
                    <Field
                      label={<>Téléphone <span className="normal-case tracking-normal font-normal text-muted-foreground/60">(optionnel)</span></> as unknown as string}
                      type="tel" value={regTel} onChange={setRegTel} placeholder="+241 XX XXX XXX" />
                    <Field label="Mot de passe" type={showPwd ? 'text' : 'password'} value={regPwd}
                      onChange={setRegPwd} placeholder="Minimum 6 caractères" autoComplete="new-password" suffix={eyeBtn} />
                    <Field label="Confirmer le mot de passe" type={showPwd ? 'text' : 'password'} value={regConfirm}
                      onChange={setRegConfirm} placeholder="Répétez le mot de passe" autoComplete="new-password" />

                    {regError && (
                      <p className="font-body text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                        {regError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.2em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors rounded-xl mt-1"
                    >
                      {loading ? 'Création du compte…' : <><span>Créer mon compte</span><ArrowRight className="w-4 h-4" /></>}
                    </button>

                    <p className="font-body text-sm text-muted-foreground text-center pt-1">
                      Déjà membre ?{' '}
                      <button type="button" onClick={() => switchTab('connexion')} className="text-primary hover:underline underline-offset-2">
                        Se connecter
                      </button>
                    </p>
                  </form>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>
      </div>
    </div>
    <Footer />
    </>
  );
}
