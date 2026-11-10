import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Circle, Eye, EyeOff, KeyRound, Loader2, MailCheck } from '@/components/icons';
import { toast } from 'sonner';
import { requestAdminPasswordReset, resetAdminPassword } from '@/services/authService';
import { useAdminTheme } from '@/hooks/useAdminTheme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import loginBg from '@/assets/admin-login-bg.jpg';
import logo from '@/assets/logo.png';

import { PASSWORD_RULES } from '@/lib/password';

// Sans ?token= : demande du lien. Avec ?token= (lien reçu par email) : saisie du nouveau mot de passe.
export default function AdminPasswordResetPage() {
  useAdminTheme();
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <div className="min-h-screen flex bg-foreground">
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
        <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 to-foreground/30" />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <img src={logo} alt="La Délicieuse Diète" className="w-16 h-16 mx-auto mb-4 object-contain" />
            <h1 className="font-display text-3xl text-primary-foreground mb-1">La Délicieuse Diète</h1>
            <p className="font-body text-xs tracking-[3px] uppercase text-primary">Administration</p>
          </div>

          <Card className="border-0 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)] bg-white overflow-hidden">
            <div className="h-[3px] bg-primary" />
            <CardContent className="p-8">
              {token ? <NewPasswordForm token={token} /> : <RequestLinkForm />}
              <Link to="/admin/login" className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Retour à la connexion
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RequestLinkForm() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await requestAdminPasswordReset(email.trim());
    setLoading(false);
    if (res.success) setSent(true);
    else toast.error(res.message);
  };

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <MailCheck className="w-10 h-10 text-primary mx-auto" />
        <h2 className="font-display text-xl text-foreground">Vérifiez votre boîte mail</h2>
        <p className="text-sm text-muted-foreground">
          Si cette adresse correspond au compte administrateur, un lien valable 30 minutes vient d'être envoyé.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-xl text-foreground leading-tight">Mot de passe oublié</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Recevez un lien de réinitialisation</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</Label>
        <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="email" placeholder="admin@example.com" disabled={loading} className="h-11" autoFocus />
      </div>
      <Button type="submit" className="w-full h-11" disabled={loading || !email}>
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi…</> : 'Envoyer le lien'}
      </Button>
    </form>
  );
}

function NewPasswordForm({ token }: { token: string }) {
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [show, setShow]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [expired, setExpired]     = useState(false);

  const rulesOk = PASSWORD_RULES.every(r => r.test(password));
  const matches = password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rulesOk || !matches) return;
    setLoading(true);
    const res = await resetAdminPassword(token, password);
    setLoading(false);
    if (res.success) setDone(true);
    else if (/invalide|expir/i.test(res.message)) setExpired(true);
    else toast.error(res.message);
  };

  if (expired) {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="font-display text-xl text-foreground">Lien expiré ou déjà utilisé</h2>
        <p className="text-sm text-muted-foreground">Un lien n'est valable que 30 minutes et une seule fois.</p>
        <Button asChild className="w-full h-11"><Link to="/admin/forgot-password">Recevoir un nouveau lien</Link></Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <MailCheck className="w-10 h-10 text-primary mx-auto" />
        <h2 className="font-display text-xl text-foreground">Mot de passe mis à jour</h2>
        <Button asChild className="w-full h-11"><Link to="/admin/login">Se connecter</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-display text-xl text-foreground leading-tight">Nouveau mot de passe</h2>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-password" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Nouveau mot de passe</Label>
        <div className="relative">
          <Input id="new-password" type={show ? 'text' : 'password'} value={password}
            onChange={e => setPassword(e.target.value)} autoComplete="new-password" disabled={loading} className="h-11 pr-11" autoFocus />
          <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Masquer' : 'Afficher'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
          {PASSWORD_RULES.map(r => (
            <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.test(password) ? 'text-foreground' : 'text-muted-foreground'}`}>
              {r.test(password) ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {r.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm-password" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Confirmation</Label>
        <Input id="confirm-password" type={show ? 'text' : 'password'} value={confirm}
          onChange={e => setConfirm(e.target.value)} autoComplete="new-password" disabled={loading} className="h-11" />
        {confirm && !matches && <p className="text-xs text-destructive">Les mots de passe ne correspondent pas.</p>}
      </div>

      <Button type="submit" className="w-full h-11" disabled={loading || !rulesOk || !matches}>
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</> : 'Enregistrer'}
      </Button>
    </form>
  );
}
