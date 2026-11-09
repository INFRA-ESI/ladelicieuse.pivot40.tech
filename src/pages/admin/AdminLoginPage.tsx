import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ShieldCheck, ArrowLeft,
  Loader2, Lock, RotateCcw,
} from '@/components/icons';
import { toast } from 'sonner';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { requestOTP, verifyOTP } from '@/services/authService';
import { useAdminTheme } from '@/hooks/useAdminTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { OTPInputField } from '@/components/admin/OTPInputField';
import { cn } from '@/lib/utils';
import { loginPasswordError } from '@/lib/password';
import loginBg from '@/assets/admin-login-bg.jpg';
import logo from '@/assets/logo.png';

type LoginStep = 'credentials' | 'otp';

const OTP_LENGTH = 6;

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 2) return email;
  return email[0] + '•••' + email.slice(at);
}

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Variantes d'animation page ────────────────────────────────────────────────
const stepVariants: Variants = {
  enter:  { opacity: 0, x: 24, filter: 'blur(4px)' },
  center: { opacity: 1, x: 0,  filter: 'blur(0px)', transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:   { opacity: 0, x: -24, filter: 'blur(4px)', transition: { duration: 0.2 } },
};

export default function AdminLoginPage() {
  useAdminTheme();
  const navigate = useNavigate();

  // ── État global ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<LoginStep>('credentials');

  // Étape 1 — identifiants
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingCreds, setLoadingCreds] = useState(false);

  // Étape 2 — OTP
  const [otp, setOtp]               = useState('');
  const [loadingOTP, setLoadingOTP] = useState(false);
  const [hasOtpError, setHasOtpError] = useState(false);
  const [otpErrorMsg, setOtpErrorMsg] = useState('');
  const [otpExpires, setOtpExpires] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const otpTotalRef     = useRef<number>(300);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer OTP ─────────────────────────────────────────────────────────────
  const startOTPTimer = useCallback((expiresIn: number) => {
    otpTotalRef.current = expiresIn;
    setOtpExpires(expiresIn);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setOtpExpires(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          setStep('credentials');
          setOtp('');
          toast.error('Code expiré. Veuillez vous reconnecter.');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Cooldown renvoi ───────────────────────────────────────────────────────
  const startResendCooldown = useCallback(() => {
    setResendCooldown(60);
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(resendIntervalRef.current!);
          resendIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── Étape 1 : demande OTP ─────────────────────────────────────────────────
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    const weak = loginPasswordError(password);
    if (weak) {
      toast.error(weak);
      return;
    }
    setLoadingCreds(true);
    const res = await requestOTP({ email, password });
    setLoadingCreds(false);
    if (res.success) {
      setStep('otp');
      setOtp('');
      setHasOtpError(false);
      setOtpErrorMsg('');
      startResendCooldown();
      if (res.expiresIn) startOTPTimer(res.expiresIn);
    } else {
      toast.error(res.message || 'Identifiants incorrects');
    }
  };

  // ── Étape 2 : vérification OTP ────────────────────────────────────────────
  const submitOTP = useCallback(async (value: string) => {
    if (!value || value.length !== OTP_LENGTH || loadingOTP) return;
    setLoadingOTP(true);
    setOtpErrorMsg('');
    const res = await verifyOTP({ email, otp: value });
    setLoadingOTP(false);
    if (res.success) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      toast.success('Connexion réussie');
      navigate('/admin');
    } else {
      const msg = res.message || 'Code incorrect. Réessayez.';
      toast.error(msg);
      setOtpErrorMsg(msg);
      setHasOtpError(true);
      setOtp('');
      setTimeout(() => { setHasOtpError(false); setOtpErrorMsg(''); }, 700);
    }
  }, [email, loadingOTP, navigate]);

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    submitOTP(otp);
  };

  // ── Renvoi du code ────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendCooldown > 0 || loadingOTP) return;
    setLoadingOTP(true);
    const res = await requestOTP({ email, password });
    setLoadingOTP(false);
    if (res.success) {
      toast.success('Nouveau code envoyé');
      setOtp('');
      setHasOtpError(false);
      setOtpErrorMsg('');
      startResendCooldown();
      if (res.expiresIn) startOTPTimer(res.expiresIn);
    } else {
      toast.error(res.message || 'Impossible de renvoyer le code');
    }
  };

  // ── Retour aux identifiants ───────────────────────────────────────────────
  const handleBack = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    setStep('credentials');
    setOtp('');
    setHasOtpError(false);
    setOtpErrorMsg('');
    setOtpExpires(null);
    setResendCooldown(0);
  };

  const timerProgress = otpExpires !== null
    ? Math.max(0, (otpExpires / otpTotalRef.current) * 100)
    : 0;

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-foreground">

      {/* ── Gauche : image décorative ────────────────────────────────────── */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img
          src={loginBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 to-foreground/30" />
        <div className="relative z-10 flex flex-col justify-end h-full p-12">
          <p className="font-body text-xs tracking-[4px] uppercase text-primary mb-4">
            Admin Portal
          </p>
          <h2 className="font-display text-4xl text-primary-foreground leading-tight mb-4">
            Gérez votre restaurant<br />en toute simplicité
          </h2>
          <p className="font-body text-primary-foreground/55 max-w-sm text-sm leading-relaxed">
            Commandes, ingrédients, clients, factures — tout est centralisé
            dans votre espace d'administration La Délicieuse Diète.
          </p>
        </div>
      </div>

      {/* ── Droite : formulaire ──────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">

          {/* Logo + titre */}
          <div className="text-center mb-8">
            <img
              src={logo}
              alt="La Délicieuse Diète"
              className="w-16 h-16 mx-auto mb-4 object-contain"
            />
            <h1 className="font-display text-3xl text-primary-foreground mb-1">
              La Délicieuse Diète
            </h1>
            <p className="font-body text-xs tracking-[3px] uppercase text-primary">
              Administration
            </p>
          </div>

          {/* ── Carte animée ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">

            {/* ══ ÉTAPE 1 : Identifiants ══ */}
            {step === 'credentials' && (
              <motion.div
                key="credentials"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <Card className="border-0 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)] bg-white overflow-hidden">
                  {/* Barre décorative */}
                  <div className="h-[3px] bg-primary" />

                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-7">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Lock className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-display text-xl text-foreground leading-tight">
                          Connexion sécurisée
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Accès au back-office
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleRequestOTP} className="space-y-5">
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Email
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="admin@example.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          disabled={loadingCreds}
                          autoComplete="email"
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          Mot de passe
                        </Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            disabled={loadingCreds}
                            autoComplete="current-password"
                            className="h-11 pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                          </button>
                        </div>
                      </div>

                      <div className="text-right -mt-2">
                        <Link to="/admin/forgot-password" className="text-xs text-primary hover:underline">
                          Mot de passe oublié ?
                        </Link>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-11 mt-1"
                        disabled={loadingCreds || !email || !password}
                      >
                        {loadingCreds ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Vérification...
                          </>
                        ) : (
                          'Continuer'
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ══ ÉTAPE 2 : OTP ══ */}
            {step === 'otp' && (
              <motion.div
                key="otp"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <Card className="border-0 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)] bg-white overflow-hidden">
                  {/* Barre décorative */}
                  <div className="h-[3px] bg-primary" />

                  <CardContent className="p-8">

                    {/* ── Icône sécurité ── */}
                    <div className="flex justify-center mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-primary/10 scale-[1.3] opacity-50" />
                        <div className="relative w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <ShieldCheck className="w-7 h-7 text-primary" strokeWidth={1.5} />
                        </div>
                      </div>
                    </div>

                    {/* ── En-tête ── */}
                    <div className="text-center mb-7">
                      <h2 className="font-display text-[22px] text-foreground mb-1.5">
                        Vérification 2FA
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Code envoyé à{' '}
                        <span className="font-medium text-foreground">
                          {maskEmail(email)}
                        </span>
                      </p>
                    </div>

                    {/* ── Formulaire OTP ── */}
                    <form onSubmit={handleVerifyOTP}>

                      {/* ─ Blocs OTP ─ */}
                      <OTPInputField
                        value={otp}
                        onChange={setOtp}
                        onComplete={submitOTP}
                        length={OTP_LENGTH}
                        hasError={hasOtpError}
                        isLoading={loadingOTP}
                        autoFocus
                      />

                      {/* ─ Message d'erreur ─ */}
                      <AnimatePresence>
                        {otpErrorMsg && (
                          <motion.p
                            key="err"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-center text-sm text-destructive mt-3 font-medium"
                          >
                            {otpErrorMsg}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      {/* ─ Timer ─ */}
                      {otpExpires !== null && (
                        <div className="mt-5 px-1">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-muted-foreground">
                              Validité du code
                            </span>
                            <span
                              className={cn(
                                'text-xs font-mono font-semibold tabular-nums transition-colors',
                                otpExpires <= 60
                                  ? 'text-destructive'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {formatTimer(otpExpires)}
                            </span>
                          </div>
                          {/* Barre de progression */}
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-1000 ease-linear',
                                otpExpires <= 60 ? 'bg-destructive' : 'bg-primary',
                              )}
                              style={{ width: `${timerProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* ─ Bouton soumettre ─ */}
                      <Button
                        type="submit"
                        className="w-full h-11 mt-6"
                        disabled={loadingOTP || otp.length !== OTP_LENGTH}
                      >
                        {loadingOTP ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Vérification...
                          </>
                        ) : (
                          'Confirmer le code'
                        )}
                      </Button>

                      {/* ─ Actions secondaires ─ */}
                      <div className="flex items-center justify-between mt-4">
                        <button
                          type="button"
                          onClick={handleBack}
                          disabled={loadingOTP}
                          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          Retour
                        </button>

                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={loadingOTP || resendCooldown > 0}
                          className={cn(
                            'flex items-center gap-1.5 text-sm transition-colors',
                            resendCooldown > 0 || loadingOTP
                              ? 'text-muted-foreground/50 cursor-not-allowed'
                              : 'text-primary hover:text-primary/75',
                          )}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {resendCooldown > 0
                            ? `Renvoyer (${resendCooldown}s)`
                            : 'Renvoyer le code'}
                        </button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Footer */}
          <p className="text-center text-xs text-primary-foreground/30 mt-6">
            © {new Date().getFullYear()} La Délicieuse Diète · Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  );
}
