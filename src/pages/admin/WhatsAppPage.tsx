import { useState, useEffect } from 'react';
import { Bell, Users, RefreshCw, CheckCircle, AlertCircle, Smartphone, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { adminGet, adminPost } from '@/services/adminApiService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  pushSubscriptions: number;
  fideliteGainsToday: number;
}

interface FideliteTx {
  _id: string;
  userId: string;
  type: 'gain' | 'rachat' | 'ajustement';
  points: number;
  soldeApres: number;
  description: string;
  createdAt: string;
}

type Segment = 'all' | 'bronze' | 'argent' | 'or' | 'platine';

const SEGMENT_LABELS: Record<Segment, string> = {
  all:     'Tous les clients actifs',
  bronze:  'Bronze',
  argent:  'Argent',
  or:      'Or',
  platine: 'Platine',
};

// ── Composant ─────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [recentTxs, setRecentTxs] = useState<FideliteTx[]>([]);
  const [loading, setLoading]     = useState(true);

  // Email broadcast form
  const [emailSegment, setEmailSegment] = useState<Segment>('all');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult]   = useState<{ sent: number; failed: number; total: number } | null>(null);

  // Push form
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody]   = useState('');
  const [pushUrl, setPushUrl]     = useState('/');
  const [pushSending, setPushSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, txRes] = await Promise.allSettled([
        adminGet<{ data: Stats }>('/notifications/stats'),
        adminGet<{ data: FideliteTx[] }>('/fidelite/recent'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (txRes.status === 'fulfilled') setRecentTxs(txRes.value.data);
    } catch {
      // stats non critiques
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcastEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) { toast.error('Objet et message requis'); return; }
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await adminPost<{ sent: number; failed: number; total: number }>(
        '/notifications/email/broadcast',
        { subject: emailSubject.trim(), message: emailMessage.trim(), segment: emailSegment },
      );
      setEmailResult(res);
      toast.success(`Email envoyé : ${res.sent} / ${res.total} destinataires`);
      setEmailSubject('');
      setEmailMessage('');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur envoi email');
    } finally {
      setEmailSending(false);
    }
  };

  const handlePush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) { toast.error('Titre et message requis'); return; }
    setPushSending(true);
    try {
      const res = await adminPost<{ sent: number; failed: number; total: number }>(
        '/notifications/push/send',
        { title: pushTitle.trim(), body: pushBody.trim(), url: pushUrl.trim() || '/' },
      );
      toast.success(`Push envoyé : ${res.sent} / ${res.total} abonnés`);
      setPushTitle('');
      setPushBody('');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Push non configuré — ajoutez les clés VAPID dans .env');
    } finally {
      setPushSending(false);
    }
  };

  return (
    <div className="space-y-6 bg-muted/30 -m-6 p-6 min-h-screen">

      {/* En-tête */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl md:text-3xl text-foreground mb-1">Communications</h2>
          <p className="font-body text-sm text-muted-foreground">Email · Push · Fidélité</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-md text-sm font-body hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Abonnés Push',        value: stats?.pushSubscriptions ?? '—',  icon: Smartphone,     color: 'text-blue-600'  },
          { label: 'Gains fidélité (24h)', value: stats?.fideliteGainsToday ?? '—', icon: CheckCircle,   color: 'text-green-600' },
          { label: 'Canal email',         value: 'Gmail',                           icon: Bell,          color: 'text-orange-500'},
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-background border border-border rounded-lg px-4 py-3 flex items-start gap-3">
              <div className={`mt-0.5 ${k.color}`}><Icon className="w-4 h-4" /></div>
              <div>
                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className={`font-display text-xl ${k.color}`}>{k.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* ── Broadcast Email ────────────────────────────────────────────────── */}
        <div className="bg-background border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-orange-500" />
            <h3 className="font-display text-base text-foreground">Broadcast Email</h3>
          </div>

          {/* Segment */}
          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Destinataires</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SEGMENT_LABELS) as Segment[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEmailSegment(s)}
                  className={`px-3 py-1.5 rounded-md font-body text-xs transition-colors ${
                    emailSegment === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {SEGMENT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Objet */}
          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Objet</label>
            <input
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              placeholder="Nouveauté chez La Délicieuse Diète…"
              className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Message */}
          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Message</label>
            <textarea
              value={emailMessage}
              onChange={e => setEmailMessage(e.target.value)}
              rows={5}
              placeholder="Rédigez votre message…"
              className="w-full px-4 py-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="font-body text-xs text-muted-foreground mt-1 text-right">{emailMessage.length} caractères</p>
          </div>

          {emailResult && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="font-body text-sm text-green-700">
                {emailResult.sent} envoyés · {emailResult.failed} échecs · {emailResult.total} destinataires
              </p>
            </div>
          )}

          <button
            onClick={handleBroadcastEmail}
            disabled={emailSending || !emailSubject.trim() || !emailMessage.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white text-sm font-body rounded-md hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {emailSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {emailSending ? 'Envoi en cours…' : 'Envoyer par Email'}
          </button>
        </div>

        {/* ── Push Notification ─────────────────────────────────────────────── */}
        <div className="bg-background border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-blue-600" />
            <h3 className="font-display text-base text-foreground">Push Notification</h3>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-body text-xs text-muted-foreground">
                  Nécessite les clés VAPID dans <code className="bg-muted px-1 rounded text-xs">backend/.env</code>
                </p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  Générez-les : <code className="bg-muted px-1 rounded text-xs">npx web-push generate-vapid-keys</code>
                </p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  {stats?.pushSubscriptions ?? 0} abonné(s) enregistré(s)
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Titre</label>
            <input
              value={pushTitle}
              onChange={e => setPushTitle(e.target.value)}
              placeholder="La Délicieuse Diète"
              className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Message</label>
            <textarea
              value={pushBody}
              onChange={e => setPushBody(e.target.value)}
              rows={3}
              placeholder="Votre message de notification…"
              className="w-full px-4 py-3 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Lien (optionnel)</label>
            <input
              value={pushUrl}
              onChange={e => setPushUrl(e.target.value)}
              placeholder="/"
              className="w-full h-10 px-4 bg-muted border border-border rounded-md font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={handlePush}
            disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-body rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pushSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            {pushSending ? 'Envoi en cours…' : `Envoyer (${stats?.pushSubscriptions ?? 0} abonnés)`}
          </button>
        </div>
      </div>

      {/* ── Activité fidélité récente ──────────────────────────────────────── */}
      <div className="bg-background border border-border rounded-lg">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-display text-base text-foreground">Activité fidélité récente</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
          </div>
        ) : recentTxs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-body text-sm text-muted-foreground">
              Aucune transaction fidélité — les points sont attribués automatiquement à chaque livraison.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTxs.map(tx => (
              <div key={tx._id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-body text-sm text-foreground">{tx.description}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-base ${tx.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.points > 0 ? '+' : ''}{tx.points} pts
                  </p>
                  <p className="font-body text-xs text-muted-foreground">Solde : {tx.soldeApres} pts</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Infos configuration ───────────────────────────────────────────── */}
      <div className="bg-background border border-border rounded-lg p-5">
        <h3 className="font-display text-base text-foreground mb-3">Configuration des canaux</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              name: 'Push Notifications',
              status: 'VAPID_PUBLIC_KEY configuré ?',
              desc: 'Générez les clés VAPID : npx web-push generate-vapid-keys → ajoutez VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans backend/.env',
              color: 'border-blue-200',
              dot: 'bg-blue-500',
            },
            {
              name: 'Fidélité automatique',
              status: 'Actif — déclenché à la livraison',
              desc: '1 point par 100 FCFA. Tiers : Bronze → Argent (500 pts) → Or (1500 pts) → Platine (3500 pts). Rachat : 100 pts = code promo 500 FCFA.',
              color: 'border-yellow-200',
              dot: 'bg-yellow-500',
            },
          ].map(c => (
            <div key={c.name} className={`border rounded-lg p-4 ${c.color}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <p className="font-body text-sm font-semibold text-foreground">{c.name}</p>
              </div>
              <p className="font-body text-xs text-muted-foreground italic mb-2">{c.status}</p>
              <p className="font-body text-xs text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
