import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, Navigate } from 'react-router-dom';
import { useUser, getTier, TIER_CONFIG, buildTierConfig, type UserOrder } from '@/context/UserContext';
import { useCart } from '@/context/CartContext';
import { TOKEN_KEY } from '@/context/UserContext';
import { ls } from '@/lib/storage';
import { getClientFidelite, redeemPoints, type FideliteEntry } from '@/services/clientService';
import { formatPrice } from '@/data/products';
import { toast } from 'sonner';
import {
  LogOut, ShoppingBag, Star, ChevronDown, Medal,
  Clock, CheckCircle, ChefHat, Package, Bike,
  Leaf, Zap, Crown, CalendarDays, PauseCircle, XCircle, PlayCircle,
  Edit3, Check, X, ArrowRight, RefreshCcw, AlertTriangle, Stethoscope,
  TrendingUp, Lock, Eye, EyeOff, Gift, Loader2,
  BadgeCheck, Sparkles, Plus, Minus, Ban, RotateCcw, Home, ArrowLeft,
  UtensilsCrossed,
} from 'lucide-react';

const HERO_IMG = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1920&q=80';

// ─── Config ────────────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, React.ElementType> = {
  essentiel: Leaf,
  vitalite:  Zap,
  premium:   Crown,
};

const TIER_RING: Record<string, string> = {
  bronze:  'ring-amber-400',
  argent:  'ring-slate-300',
  or:      'ring-yellow-400',
  platine: 'ring-violet-400',
};

const TIER_BENEFITS: Record<string, string[]> = {
  bronze:  ['Programme de fidélité actif', '1 point par 100 FCFA dépensés', 'Accès au suivi nutritionnel'],
  argent:  ['Avantages Bronze inclus', 'Livraison offerte dès 5 000 FCFA', 'Points × 1,5 sur abonnements'],
  or:      ['Avantages Argent inclus', 'Livraison toujours offerte', '−10 % sur les commandes', 'Accès prioritaire aux nouveautés'],
  platine: ['Avantages Or inclus', 'Consultation diététicien offerte / trimestre', '−15 % sur toutes les commandes', 'Service VIP · Réponse sous 2 h'],
};

const STATUS_CFG: Record<UserOrder['statut'], {
  label: string; icon: React.ElementType;
  text: string; bg: string; dot: string;
}> = {
  en_attente:     { label: 'En attente',     icon: Clock,        text: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  confirmee:      { label: 'Confirmée',      icon: CheckCircle,  text: 'text-blue-600',   bg: 'bg-blue-50',    dot: 'bg-blue-500'   },
  en_preparation: { label: 'En préparation', icon: ChefHat,      text: 'text-violet-600', bg: 'bg-violet-50',  dot: 'bg-violet-500' },
  prete:          { label: 'Prête',          icon: Package,      text: 'text-green-600',  bg: 'bg-green-50',   dot: 'bg-green-500'  },
  livree:         { label: 'Livrée',         icon: Bike,         text: 'text-primary',    bg: 'bg-primary/10', dot: 'bg-primary'    },
  annulee:        { label: 'Annulée',        icon: Ban,          text: 'text-red-600',    bg: 'bg-red-50',     dot: 'bg-red-400'    },
  remboursee:     { label: 'Remboursée',     icon: RotateCcw,    text: 'text-sky-600',    bg: 'bg-sky-50',     dot: 'bg-sky-400'    },
};

const ACTIVE_STATUSES: UserOrder['statut'][] = ['en_attente', 'confirmee', 'en_preparation', 'prete', 'livree'];

const PAIEMENT_LABELS: Record<string, string> = {
  mobile_money: 'Mobile Money',
  carte:        'Carte bancaire',
  especes:      'Espèces',
};

const MODE_LABELS: Record<string, string> = {
  livraison: 'Livraison',
  sur_place: 'Sur place',
  emporter:  'À emporter',
};

const SUB_STATUS = {
  active:    { label: 'Actif',    cls: 'text-green-600 bg-green-50 border-green-200' },
  paused:    { label: 'En pause', cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  cancelled: { label: 'Annulé',   cls: 'text-red-500   bg-red-50   border-red-200'   },
};

const TXTYPE_CFG = {
  gain:        { label: 'Gain',        icon: Plus,      color: 'text-green-600' },
  rachat:      { label: 'Rachat',      icon: Gift,      color: 'text-violet-600' },
  ajustement:  { label: 'Ajustement',  icon: Sparkles,  color: 'text-sky-600' },
};

const PREF_OPTIONS = [
  { key: 'vegetarien',      label: 'Végétarien',        desc: 'Sans viande ni poisson' },
  { key: 'vegan',           label: 'Vegan',             desc: 'Sans produits animaux' },
  { key: 'sans_gluten',     label: 'Sans gluten',       desc: 'Cœliaque ou intolérant' },
  { key: 'sans_lactose',    label: 'Sans lactose',      desc: 'Intolérance au lactose' },
  { key: 'halal',           label: 'Halal',             desc: 'Préparation certifiée halal' },
  { key: 'sans_porc',       label: 'Sans porc',         desc: 'Aucun produit à base de porc' },
  { key: 'low_carb',        label: 'Low-carb',          desc: 'Faible en glucides' },
  { key: 'riche_proteines', label: 'Riche en protéines',desc: 'Apport élevé en protéines' },
] as const;

type PrefKey = (typeof PREF_OPTIONS)[number]['key'];

async function fetchPreferences(token: string): Promise<PrefKey[]> {
  const r = await fetch('/api/client/preferences', { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return j.success ? (j.data.preferences as PrefKey[]) : [];
}

async function savePreferences(token: string, prefs: PrefKey[]): Promise<void> {
  await fetch('/api/client/preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences: prefs }),
  });
}

function validatePassword(pwd: string): string | null {
  if (pwd.length < 8)             return 'Au moins 8 caractères.';
  if (!/[A-Z]/.test(pwd))        return 'Au moins une majuscule.';
  if (!/[0-9]/.test(pwd))        return 'Au moins un chiffre.';
  if (!/[^a-zA-Z0-9]/.test(pwd)) return 'Au moins un caractère spécial.';
  return null;
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
function OrderSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[1, 2, 3].map(i => (
        <div key={i} className="px-6 py-4 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex gap-2 mb-2">
                <div className="h-5 w-20 bg-muted rounded-full" />
                <div className="h-5 w-24 bg-muted rounded-full" />
              </div>
              <div className="flex gap-3">
                <div className="h-6 w-28 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded mt-1" />
              </div>
            </div>
            <div className="h-4 w-4 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── OrderCard ─────────────────────────────────────────────────────────────────
interface OrderCardProps {
  order: UserOrder;
  isExpanded: boolean;
  onToggle: () => void;
  onRecommander: (order: UserOrder) => void;
}

function OrderCard({ order, isExpanded, onToggle, onRecommander }: OrderCardProps) {
  const cfg        = STATUS_CFG[order.statut];
  const StatusIcon = cfg.icon;
  const statusIdx  = ACTIVE_STATUSES.indexOf(order.statut as typeof ACTIVE_STATUSES[number]);
  const isActive   = statusIdx !== -1;

  return (
    <div className="relative">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.dot}`} />
      <button
        onClick={onToggle}
        className="w-full text-left pl-7 pr-6 py-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-body text-xs border ${cfg.text} ${cfg.bg}`}>
                <StatusIcon className="w-3 h-3" />{cfg.label}
              </span>
              <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">
                {order.numero ?? `#${order.id.slice(-8).toUpperCase()}`}
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-display text-lg text-foreground">{formatPrice(order.total)}</span>
              <span className="font-body text-xs text-muted-foreground">{order.date}</span>
              <span className="font-body text-xs text-muted-foreground">
                · {PAIEMENT_LABELS[order.modePaiement] ?? order.modePaiement}
              </span>
              {order.modeCommande && (
                <span className="font-body text-xs text-muted-foreground">
                  · {MODE_LABELS[order.modeCommande] ?? order.modeCommande}
                </span>
              )}
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 pt-1">
              {isActive && (
                <div className="relative flex items-start justify-between mb-6 pt-2">
                  <div className="absolute top-[15px] left-[14px] right-[14px] h-px bg-border" />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `calc(${(statusIdx / (ACTIVE_STATUSES.length - 1)) * 100}% - 28px)` }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="absolute top-[15px] left-[14px] h-px bg-primary"
                  />
                  {ACTIVE_STATUSES.map((s, i) => {
                    const done    = i <= statusIdx;
                    const current = i === statusIdx;
                    const sCfg    = STATUS_CFG[s];
                    const SIcon   = sCfg.icon;
                    return (
                      <div key={s} className="relative flex flex-col items-center gap-1.5 z-10 flex-1">
                        <motion.div
                          initial={current ? { scale: 0.7 } : false}
                          animate={current ? { scale: [1, 1.12, 1] } : {}}
                          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
                          className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all
                            ${done ? `${sCfg.dot} border-transparent` : 'bg-background border-border'}
                            ${current ? 'shadow-md' : ''}`}
                        >
                          <SIcon className={`w-3 h-3 ${done ? 'text-white' : 'text-border'}`} />
                        </motion.div>
                        <span className={`font-body text-[9px] uppercase tracking-wide text-center leading-tight max-w-[52px]
                          ${done ? sCfg.text : 'text-muted-foreground/35'}`}>
                          {sCfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-muted/50 rounded-xl p-4 mb-4 space-y-2">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between font-body text-sm">
                    <span className="text-foreground flex-1 min-w-0 truncate pr-3">
                      {item.name}<span className="text-muted-foreground ml-1.5">× {item.qty}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{formatPrice(item.price * item.qty)}</span>
                  </div>
                ))}
                {order.fraisLivraison !== undefined && order.fraisLivraison > 0 && (
                  <div className="flex items-center justify-between font-body text-sm text-muted-foreground pt-1 border-t border-border">
                    <span>Livraison</span>
                    <span>{formatPrice(order.fraisLivraison)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-display text-sm text-foreground">Total</span>
                  <span className="font-display text-base text-primary">{formatPrice(order.total)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  {order.pointsGagnes > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      <span className="font-body text-xs text-muted-foreground">+{order.pointsGagnes} pts fidélité</span>
                    </div>
                  )}
                </div>
                {order.statut === 'livree' && (
                  <button
                    onClick={() => onRecommander(order)}
                    className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-3 py-2 border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />Recommander
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function MonComptePage() {
  const { user, logout, tiers, updateProfile, cancelSubscription, pauseSubscription, resumeSubscription, refreshOrders, changePassword } = useUser();
  const { addItem } = useCart();

  // ── Tab & UI state ──
  const [activeTab, setActiveTab]           = useState<'commandes' | 'fidelite' | 'abonnement' | 'preferences'>('commandes');
  const [expandedOrder, setExpandedOrder]   = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm]   = useState(false);

  // Skeleton uniquement si aucune donnée en cache (première connexion)
  const [ordersLoading, setOrdersLoading]   = useState(user?.commandes === undefined);
  const [ordersError, setOrdersError]       = useState<string | null>(null);

  // ── Profile edit ──
  const [isEditing, setIsEditing]           = useState(false);
  const [editForm, setEditForm]             = useState({ prenoms: '', nom: '', telephone: '', email: '' });
  const [editErrors, setEditErrors]         = useState({ prenoms: '', nom: '', telephone: '', email: '' });
  const [showPwdSection, setShowPwdSection] = useState(false);
  const [pwdForm, setPwdForm]               = useState({ current: '', next: '', confirm: '' });
  const [pwdErrors, setPwdErrors]           = useState({ current: '', next: '', confirm: '' });
  const [showPwd, setShowPwd]               = useState({ current: false, next: false });
  const [pwdLoading, setPwdLoading]         = useState(false);
  const [profileSaving, setProfileSaving]   = useState(false);

  // ── Fidelity data ──
  const [fideliteLoading, setFideliteLoading] = useState(false);
  const [fideliteHist, setFideliteHist]       = useState<FideliteEntry[]>([]);
  const [redeemQty, setRedeemQty]             = useState(100);
  const [redeemLoading, setRedeemLoading]     = useState(false);
  const [lastCode, setLastCode]               = useState<{ code: string; valeurFCFA: number } | null>(null);

  // ── Dietary preferences ──
  const [prefSelected, setPrefSelected]   = useState<PrefKey[]>([]);
  const [prefLoading, setPrefLoading]     = useState(false);
  const [prefSaving, setPrefSaving]       = useState(false);

  // ── Effects — AVANT le guard !user (règle des hooks) ──
  // user?.id et non user — refreshOrders() crée un nouvel objet user à chaque appel,
  // ce qui déclencherait une boucle infinie si on dépendait de l'objet entier.
  useEffect(() => {
    if (!user?.id || activeTab !== 'commandes') return;
    setOrdersError(null);
    refreshOrders()
      .catch(e => setOrdersError((e as Error).message))
      .finally(() => setOrdersLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id, refreshOrders]);

  // Actualisation silencieuse toutes les 30s pour les mises à jour de statut en temps réel
  useEffect(() => {
    if (!user?.id || activeTab !== 'commandes') return;
    const id = setInterval(() => {
      refreshOrders().catch(() => {});
    }, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id, refreshOrders]);

  useEffect(() => {
    if (!user?.id || activeTab !== 'fidelite') return;
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    setFideliteLoading(true);
    getClientFidelite(token)
      .then(d => setFideliteHist(d.historique))
      .catch(() => {})
      .finally(() => setFideliteLoading(false));
  }, [activeTab, user?.id]);

  useEffect(() => {
    if (!user?.id || activeTab !== 'preferences') return;
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    setPrefLoading(true);
    fetchPreferences(token)
      .then(p => setPrefSelected(p))
      .catch(() => {})
      .finally(() => setPrefLoading(false));
  }, [activeTab, user?.id]);

  const togglePref = useCallback((key: PrefKey) => {
    setPrefSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const handleSavePreferences = async () => {
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    setPrefSaving(true);
    try {
      await savePreferences(token, prefSelected);
      toast.success('Préférences enregistrées');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setPrefSaving(false);
    }
  };

  if (!user) return <Navigate to="/connexion" replace />;

  // ── Derived ──
  const tierConfig = tiers.length > 0 ? buildTierConfig(tiers) : TIER_CONFIG;
  const tier    = getTier(user.points, tiers.length > 0 ? tiers : undefined);
  const tierCfg = tierConfig[tier] ?? TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  const nextTier = (() => {
    if (tiers.length > 0) {
      const sorted = [...tiers].sort((a, b) => a.pointsMin - b.pointsMin);
      const idx = sorted.findIndex(t => t.slug === tier);
      return idx >= 0 && idx < sorted.length - 1 ? (tierConfig[sorted[idx + 1].slug] ?? null) : null;
    }
    const nk = tier === 'bronze' ? 'argent' : tier === 'argent' ? 'or' : tier === 'or' ? 'platine' : null;
    return nk ? TIER_CONFIG[nk] : null;
  })();
  const pct       = nextTier ? Math.min(100, ((user.points - tierCfg.min) / (nextTier.min - tierCfg.min)) * 100) : 100;
  const initials  = [(user.prenoms || '')[0], (user.nom || '')[0]].filter(Boolean).join('').toUpperCase();
  const firstName = (user.prenoms || user.nom).split(' ')[0];
  const PlanIcon  = user.subscription ? (PLAN_ICONS[user.subscription.planId] ?? Leaf) : Leaf;
  const redeemValue = redeemQty * 5;
  const benefits      = TIER_BENEFITS[tier] ?? TIER_BENEFITS.bronze;
  const commandes     = user.commandes ?? [];
  const activeOrders  = commandes.filter(o => ['en_attente', 'confirmee', 'en_preparation', 'prete'].includes(o.statut));
  const historyOrders = commandes.filter(o => ['livree', 'annulee', 'remboursee'].includes(o.statut));

  // ── Profile handlers ──
  const startEditing = () => {
    setEditForm({ prenoms: user.prenoms || '', nom: user.nom, telephone: user.telephone, email: user.email });
    setEditErrors({ prenoms: '', nom: '', telephone: '', email: '' });
    setPwdForm({ current: '', next: '', confirm: '' });
    setPwdErrors({ current: '', next: '', confirm: '' });
    setShowPwdSection(false);
    setIsEditing(true);
  };

  const handleEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = { prenoms: '', nom: '', telephone: '', email: '' };
    if (!editForm.prenoms.trim()) err.prenoms   = 'Requis';
    if (!editForm.nom.trim())     err.nom       = 'Requis';
    if (!editForm.telephone.trim()) err.telephone = 'Requis';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) err.email = 'Email invalide';
    if (Object.values(err).some(Boolean)) { setEditErrors(err); return; }

    if (showPwdSection && pwdForm.current) {
      const pErr = { current: '', next: '', confirm: '' };
      if (!pwdForm.next) { pErr.next = 'Requis'; setPwdErrors(pErr); return; }
      const vErr = validatePassword(pwdForm.next);
      if (vErr) { pErr.next = vErr; setPwdErrors(pErr); return; }
      if (pwdForm.next !== pwdForm.confirm) { pErr.confirm = 'Les mots de passe ne correspondent pas.'; setPwdErrors(pErr); return; }
    }

    setProfileSaving(true);
    try {
      if (showPwdSection && pwdForm.current && pwdForm.next) {
        setPwdLoading(true);
        try {
          await changePassword(pwdForm.current, pwdForm.next);
          toast.success('Mot de passe mis à jour');
        } finally {
          setPwdLoading(false);
        }
      }

      await updateProfile({
        prenoms: editForm.prenoms.trim(),
        nom: editForm.nom.trim(),
        telephone: editForm.telephone.trim(),
        email: editForm.email.trim(),
      });
      setIsEditing(false);
      toast.success('Profil mis à jour');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRecommander = (order: UserOrder) => {
    order.items.forEach(item => {
      addItem({
        id: `reorder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'salade',
        name: item.name,
        totalPrice: item.price,
        totalCalories: 0,
        quantity: item.qty,
      });
    });
    toast.success('Articles ajoutés au panier');
  };

  const handleCancelSub = () => {
    cancelSubscription();
    setCancelConfirm(false);
    toast.success('Abonnement annulé');
  };

  const handleRedeem = async () => {
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    if (redeemQty < 100) { toast.error('Minimum 100 points'); return; }
    if (redeemQty > user.points) { toast.error('Solde insuffisant'); return; }
    setRedeemLoading(true);
    try {
      const result = await redeemPoints(token, redeemQty);
      setLastCode({ code: result.code, valeurFCFA: result.valeurFCFA });
      toast.success(`Code généré : ${result.code}`);
      await refreshOrders().catch(() => {});
      const newToken = ls.get(TOKEN_KEY);
      if (newToken) {
        getClientFidelite(newToken).then(d => setFideliteHist(d.historique)).catch(() => {});
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRedeemLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">

      {/* ══ Hero ══ */}
      <section className="relative h-screen flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="Mon espace" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 pb-16 md:pb-24"
        >
          <span className="font-body text-xs uppercase tracking-[0.3em] text-primary mb-4 block">Mon espace</span>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] mb-6">
            Bonjour,<br /><span className="italic">{firstName}</span>
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/75 italic max-w-xl mb-10">
            {tierCfg.label} · {user.points.toLocaleString('fr-FR')} points fidélité
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#compte" className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
              Voir mon compte
            </a>
            {commandes.length > 0 && (
              <a href="#compte" className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 border border-white/40 text-white hover:bg-white/10 transition-colors rounded-xl">
                {commandes.length} commande{commandes.length > 1 ? 's' : ''}
              </a>
            )}
          </div>
        </motion.div>
      </section>

      {/* ══ Contenu ══ */}
      <div id="compte" className="bg-muted/20 pb-20">
        <div className="max-w-5xl mx-auto px-6 pt-16">
          <div className="flex flex-col md:flex-row gap-6 items-start">

            {/* ══════════════════════════════════════
                SIDEBAR
            ══════════════════════════════════════ */}
            <aside className="w-full md:w-72 shrink-0 flex flex-col gap-4 md:sticky md:top-28">

              {/* ── Profile card ── */}
              <div className="bg-background border border-border rounded-2xl overflow-hidden">
                <div className={`h-1.5 w-full ${
                  tier === 'bronze' ? 'bg-amber-400' :
                  tier === 'argent' ? 'bg-slate-400' :
                  tier === 'or'     ? 'bg-yellow-400' :
                                      'bg-violet-500'
                }`} />
                <div className="p-6">

                  {/* Avatar */}
                  <div className="flex items-start justify-between mb-5">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className={`w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-offset-2 ring-offset-background ${TIER_RING[tier]}`}
                    >
                      <span className={`font-display text-xl ${tierCfg.color}`}>{initials}</span>
                    </motion.div>
                    {!isEditing && (
                      <button onClick={startEditing} className="flex items-center gap-1.5 font-body text-xs text-muted-foreground hover:text-primary transition-colors mt-1">
                        <Edit3 className="w-3.5 h-3.5" />Modifier
                      </button>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    {!isEditing ? (
                      <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-5">
                        <h2 className="font-display text-xl text-foreground">{user.prenoms} {user.nom}</h2>
                        <p className="font-body text-sm text-muted-foreground mt-0.5">{user.telephone}</p>
                        <p className="font-body text-sm text-muted-foreground">{user.email}</p>
                        <p className="font-body text-xs text-muted-foreground/50 mt-2 uppercase tracking-wider">
                          Client depuis le {user.dateInscription}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.form
                        key="edit"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onSubmit={handleEditSubmit}
                        className="mb-5 flex flex-col gap-3"
                      >
                        {/* Infos de base */}
                        <div className="grid grid-cols-2 gap-2">
                          {(['prenoms', 'nom'] as const).map(field => (
                            <div key={field}>
                              <input
                                type="text"
                                value={editForm[field]}
                                onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                placeholder={field === 'prenoms' ? 'Prénom(s)' : 'Nom'}
                                className={`w-full font-body text-sm px-3 py-2.5 border rounded-xl bg-background outline-none transition-colors
                                  ${editErrors[field] ? 'border-red-400' : 'border-border focus:border-primary'}`}
                              />
                              {editErrors[field] && <p className="font-body text-xs text-red-500 mt-1">{editErrors[field]}</p>}
                            </div>
                          ))}
                        </div>
                        {(['telephone', 'email'] as const).map(field => (
                          <div key={field}>
                            <input
                              type={field === 'email' ? 'email' : 'tel'}
                              value={editForm[field]}
                              onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                              placeholder={field === 'telephone' ? 'Téléphone' : 'Email'}
                              className={`w-full font-body text-sm px-3 py-2.5 border rounded-xl bg-background outline-none transition-colors
                                ${editErrors[field] ? 'border-red-400' : 'border-border focus:border-primary'}`}
                            />
                            {editErrors[field] && <p className="font-body text-xs text-red-500 mt-1">{editErrors[field]}</p>}
                          </div>
                        ))}

                        {/* Section mot de passe (toggle) */}
                        <button
                          type="button"
                          onClick={() => setShowPwdSection(v => !v)}
                          className={`w-full flex items-center justify-center gap-2 font-body text-xs uppercase tracking-[0.15em] px-3 py-2.5 border rounded-xl transition-colors
                            ${showPwdSection
                              ? 'border-primary/40 bg-primary/8 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5'
                            }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          {showPwdSection ? 'Masquer le mot de passe' : 'Changer le mot de passe'}
                        </button>

                        <AnimatePresence>
                          {showPwdSection && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="overflow-hidden flex flex-col gap-2"
                            >
                              {(['current', 'next', 'confirm'] as const).map(field => (
                                <div key={field} className="relative">
                                  <input
                                    type={showPwd[field as 'current' | 'next'] ? 'text' : 'password'}
                                    value={pwdForm[field]}
                                    onChange={e => setPwdForm(f => ({ ...f, [field]: e.target.value }))}
                                    placeholder={
                                      field === 'current' ? 'Mot de passe actuel' :
                                      field === 'next'    ? 'Nouveau mot de passe' :
                                                            'Confirmer le nouveau'
                                    }
                                    className={`w-full font-body text-sm px-3 py-2.5 pr-9 border rounded-xl bg-background outline-none transition-colors
                                      ${pwdErrors[field] ? 'border-red-400' : 'border-border focus:border-primary'}`}
                                  />
                                  {field !== 'confirm' && (
                                    <button
                                      type="button"
                                      onClick={() => setShowPwd(s => ({ ...s, [field]: !s[field as 'current' | 'next'] }))}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                      {showPwd[field as 'current' | 'next'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  {pwdErrors[field] && <p className="font-body text-xs text-red-500 mt-1">{pwdErrors[field]}</p>}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={pwdLoading || profileSaving}
                            className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs uppercase tracking-wider py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors rounded-xl"
                          >
                            {(pwdLoading || profileSaving) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs uppercase tracking-wider py-2.5 border border-border text-muted-foreground hover:text-foreground transition-colors rounded-xl"
                          >
                            <X className="w-3.5 h-3.5" />Annuler
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Loyalty mini */}
                  <div className={`rounded-xl px-4 py-3 ${tierCfg.bg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Medal className={`w-4 h-4 ${tierCfg.color}`} />
                        <span className={`font-display text-base ${tierCfg.color}`}>{tierCfg.label}</span>
                      </div>
                      <span className={`font-body text-xs font-bold ${tierCfg.color}`}>
                        {user.points.toLocaleString('fr-FR')} pts
                      </span>
                    </div>
                    {nextTier ? (
                      <>
                        <div className="w-full bg-white/60 rounded-full h-1.5 mb-1.5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.9, delay: 0.4 }}
                            className={`h-full rounded-full ${tierCfg.color.replace('text-', 'bg-')}`}
                          />
                        </div>
                        <p className={`font-body text-[11px] ${tierCfg.color} opacity-70`}>
                          {(nextTier.min - user.points).toLocaleString('fr-FR')} pts pour {nextTier.label}
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Star className={`w-3.5 h-3.5 fill-current ${tierCfg.color}`} />
                        <p className={`font-body text-[11px] ${tierCfg.color} opacity-70`}>Niveau maximum !</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={logout}
                    className="mt-2 w-full flex items-center justify-center gap-2 font-body text-xs uppercase tracking-[0.15em] px-3 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors rounded-xl"
                  >
                    <LogOut className="w-3.5 h-3.5" />Se déconnecter
                  </button>
                </div>
              </div>

              {/* ── Stats ── */}
              <div className="bg-background border border-border rounded-2xl px-5 py-4">
                <div className="grid grid-cols-3 text-center divide-x divide-border">
                  <div className="pr-3">
                    <p className="font-display text-2xl text-foreground">{(user.commandes ?? []).length}</p>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Commandes</p>
                  </div>
                  <div className="px-3">
                    <p className={`font-display text-2xl ${tierCfg.color}`}>{user.points.toLocaleString('fr-FR')}</p>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Points</p>
                  </div>
                  <div className="pl-3">
                    <p className="font-display text-2xl text-foreground">
                      {(user.commandes ?? []).length > 0
                        ? ((user.commandes ?? []).reduce((s, o) => s + (o.total ?? 0), 0) / 1000).toFixed(0) + 'k'
                        : '0'}
                    </p>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">FCFA dépensés</p>
                  </div>
                </div>
              </div>

              {/* ── Quick actions ── */}
              <div className="bg-background border border-border rounded-2xl p-4">
                <p className="font-body text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3 px-1">Accès rapide</p>
                <div className="flex flex-col gap-1">
                  {[
                    { to: '/composer',    icon: ShoppingBag, label: 'À Commander',  sub: 'Salades, jus, repas',        bg: 'bg-primary/10', text: 'text-primary'  },
                    { to: '/abonnement',  icon: Zap,         label: 'Abonnements',  sub: 'Plans hebdomadaires',        bg: 'bg-amber-100',  text: 'text-amber-600' },
                    { to: '/suivi',       icon: TrendingUp,  label: 'Mon suivi',    sub: 'Poids, calories, objectifs', bg: 'bg-green-100',  text: 'text-green-600' },
                    { to: '/dieteticien', icon: Stethoscope, label: 'Diététicien',  sub: 'Conseil nutritionnel',       bg: 'bg-violet-100', text: 'text-violet-600' },
                  ].map(({ to, icon: Icon, label, sub, bg, text }) => (
                    <Link key={to} to={to} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                        <Icon className={`w-4 h-4 ${text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-foreground leading-tight">{label}</p>
                        <p className="font-body text-[11px] text-muted-foreground">{sub}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  ))}
                </div>
              </div>
            </aside>

            {/* ══════════════════════════════════════
                MAIN
            ══════════════════════════════════════ */}
            <main className="flex-1 min-w-0 flex flex-col gap-4">

              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-3xl md:text-4xl text-foreground">Mon espace</h2>
                <span className="font-body text-xs text-muted-foreground uppercase tracking-wider">
                  Client depuis le {user.dateInscription}
                </span>
              </div>

              {/* ── Tabs ── */}
              <div className="bg-background border border-border rounded-2xl overflow-hidden">
                <div className="flex border-b border-border overflow-x-auto">
                  {(['commandes', 'fidelite', 'abonnement', 'preferences'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative shrink-0 flex items-center justify-center gap-2 px-4 py-4 font-body text-sm uppercase tracking-wider transition-colors
                        ${activeTab === tab ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {tab === 'commandes'   && 'Commandes'}
                      {tab === 'fidelite'    && 'Fidélité'}
                      {tab === 'abonnement'  && 'Abonnement'}
                      {tab === 'preferences' && 'Préférences'}
                      {tab === 'commandes' && commandes.length > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-body text-[10px] flex items-center justify-center">
                          {commandes.length}
                        </span>
                      )}
                      {activeTab === tab && (
                        <motion.div layoutId="tab-line" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                      )}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">

                  {/* ─── Commandes ─── */}
                  {activeTab === 'commandes' && (
                    <motion.div
                      key="commandes"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                    >
                      {ordersLoading ? (
                        <OrderSkeleton />
                      ) : ordersError ? (
                        <div className="p-10 flex flex-col items-center gap-3 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                          </div>
                          <p className="font-body text-sm text-red-500 max-w-xs">{ordersError}</p>
                          <button
                            onClick={() => { setOrdersLoading(true); setOrdersError(null); refreshOrders().catch(e => setOrdersError((e as Error).message)).finally(() => setOrdersLoading(false)); }}
                            className="inline-flex items-center gap-1.5 font-body text-xs text-primary hover:underline"
                          >
                            <RefreshCcw className="w-3 h-3" />Réessayer
                          </button>
                        </div>
                      ) : commandes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
                          <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
                            <ShoppingBag className="w-9 h-9 text-muted-foreground/30" />
                          </div>
                          <h3 className="font-display text-2xl text-foreground mb-2">Aucune commande</h3>
                          <p className="font-body text-sm text-muted-foreground leading-relaxed max-w-[280px] mb-8">
                            Votre historique de commandes apparaîtra ici dès votre première commande passée.
                          </p>
                          <Link
                            to="/composer"
                            className="inline-flex items-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-8 py-3.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl"
                          >
                            <ArrowRight className="w-4 h-4" />
                            Passer ma première commande
                          </Link>
                        </div>
                      ) : (
                        <div>
                          {activeOrders.length > 0 && (
                            <div className="px-6 py-2.5 bg-amber-50/60 border-b border-border flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                              <p className="font-body text-[11px] uppercase tracking-[0.18em] text-amber-700">
                                {activeOrders.length} commande{activeOrders.length > 1 ? 's' : ''} en cours
                              </p>
                            </div>
                          )}
                          {activeOrders.length > 0 && (
                            <div className="divide-y divide-border">
                              {activeOrders.map(order => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  isExpanded={expandedOrder === order.id}
                                  onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                  onRecommander={handleRecommander}
                                />
                              ))}
                            </div>
                          )}
                          {historyOrders.length > 0 && (
                            <div className={`px-6 py-2.5 bg-muted/30 border-border flex items-center ${activeOrders.length > 0 ? 'border-t border-b' : 'border-b'}`}>
                              <p className="font-body text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                Historique · {historyOrders.length} commande{historyOrders.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          {historyOrders.length > 0 && (
                            <div className="divide-y divide-border">
                              {historyOrders.map(order => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  isExpanded={expandedOrder === order.id}
                                  onToggle={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                  onRecommander={handleRecommander}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ─── Fidélité ─── */}
                  {activeTab === 'fidelite' && (
                    <motion.div
                      key="fidelite"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="p-6 flex flex-col gap-6"
                    >
                      {/* ── Tier card ── */}
                      <div className={`rounded-2xl p-6 ${tierCfg.bg} flex flex-col md:flex-row gap-6 items-center md:items-start`}>
                        <div className="flex flex-col items-center gap-3">
                          <motion.div
                            animate={{ scale: [1, 1.06, 1] }}
                            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                            className={`w-20 h-20 rounded-full bg-white/60 flex items-center justify-center ring-4 ring-offset-2 ring-offset-transparent ${TIER_RING[tier]}`}
                          >
                            <Medal className={`w-9 h-9 ${tierCfg.color}`} />
                          </motion.div>
                          <span className={`font-display text-2xl ${tierCfg.color}`}>{tierCfg.label}</span>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                          <p className={`font-body text-sm ${tierCfg.color} opacity-70 uppercase tracking-wider mb-1`}>Solde actuel</p>
                          <p className={`font-display text-4xl ${tierCfg.color} mb-3`}>{user.points.toLocaleString('fr-FR')} <span className="text-xl">pts</span></p>
                          {nextTier ? (
                            <>
                              <div className="w-full bg-white/60 rounded-full h-2 mb-2 overflow-hidden max-w-xs md:max-w-none">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 1, delay: 0.3 }}
                                  className={`h-full rounded-full ${tierCfg.color.replace('text-', 'bg-')}`}
                                />
                              </div>
                              <p className={`font-body text-xs ${tierCfg.color} opacity-60`}>
                                {(nextTier.min - user.points).toLocaleString('fr-FR')} pts pour passer {nextTier.label}
                              </p>
                            </>
                          ) : (
                            <div className="flex items-center justify-center md:justify-start gap-2">
                              <BadgeCheck className={`w-4 h-4 ${tierCfg.color}`} />
                              <p className={`font-body text-sm ${tierCfg.color}`}>Niveau maximum atteint — vous profitez de tous les avantages</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Avantages du tier ── */}
                      <div>
                        <p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Vos avantages {tierCfg.label}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {benefits.map((b, i) => (
                            <div key={i} className="flex items-start gap-2.5 p-3 bg-muted/50 rounded-xl">
                              <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${tierCfg.color}`} />
                              <span className="font-body text-sm text-foreground leading-snug">{b}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ── Tous les niveaux ── */}
                      <div>
                        <p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Les 4 niveaux</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {['bronze', 'argent', 'or', 'platine'].map(slug => {
                            const cfg = tierConfig[slug] ?? TIER_CONFIG[slug as keyof typeof TIER_CONFIG];
                            const isCurrent = slug === tier;
                            return (
                              <div key={slug} className={`rounded-xl p-3 text-center border transition-all ${isCurrent ? `${cfg.bg} border-current/20` : 'bg-muted/30 border-transparent'}`}>
                                <Medal className={`w-5 h-5 mx-auto mb-1.5 ${cfg.color} ${!isCurrent && 'opacity-40'}`} />
                                <p className={`font-display text-sm ${cfg.color} ${!isCurrent && 'opacity-40'}`}>{cfg.label}</p>
                                <p className="font-body text-[10px] text-muted-foreground mt-0.5">{cfg.min.toLocaleString('fr-FR')} pts</p>
                                {isCurrent && <div className={`mt-1.5 h-1 w-8 mx-auto rounded-full ${cfg.color.replace('text-', 'bg-')}`} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Rachat de points ── */}
                      <div className="border border-border rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <Gift className="w-4 h-4 text-primary" />
                          <p className="font-body text-sm font-semibold text-foreground">Convertir vos points en code promo</p>
                        </div>
                        <p className="font-body text-xs text-muted-foreground mb-4">
                          1 point = 5 FCFA · Minimum 100 points · Valable 30 jours
                        </p>

                        {lastCode && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl"
                          >
                            <p className="font-body text-xs text-green-700 mb-1">Code généré avec succès !</p>
                            <div className="flex items-center justify-between gap-3">
                              <code className="font-mono text-lg font-bold text-green-800 tracking-wider">{lastCode.code}</code>
                              <span className="font-display text-sm text-green-700">−{lastCode.valeurFCFA.toLocaleString('fr-FR')} FCFA</span>
                            </div>
                            <button onClick={() => { navigator.clipboard?.writeText(lastCode.code); toast.success('Code copié !'); }} className="mt-2 font-body text-xs text-green-600 hover:underline">
                              Copier le code
                            </button>
                          </motion.div>
                        )}

                        <div className="flex items-center gap-3 mb-4">
                          <button
                            onClick={() => setRedeemQty(q => Math.max(100, q - 100))}
                            disabled={redeemQty <= 100}
                            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex-1 text-center">
                            <p className="font-display text-3xl text-foreground">{redeemQty.toLocaleString('fr-FR')}</p>
                            <p className="font-body text-xs text-muted-foreground">points → {redeemValue.toLocaleString('fr-FR')} FCFA</p>
                          </div>
                          <button
                            onClick={() => setRedeemQty(q => Math.min(user.points, q + 100))}
                            disabled={redeemQty >= user.points}
                            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          onClick={handleRedeem}
                          disabled={redeemLoading || user.points < 100}
                          className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] py-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors rounded-xl"
                        >
                          {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                          {user.points < 100 ? 'Solde insuffisant (min. 100 pts)' : `Générer un code de ${redeemValue.toLocaleString('fr-FR')} FCFA`}
                        </button>
                      </div>

                      {/* ── Historique des points ── */}
                      <div>
                        <p className="font-body text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">Historique des points</p>
                        {fideliteLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : fideliteHist.length === 0 ? (
                          <p className="font-body text-sm text-muted-foreground text-center py-6 italic">Aucune transaction pour l'instant.</p>
                        ) : (
                          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
                            {fideliteHist.map(tx => {
                              const cfg = TXTYPE_CFG[tx.type] ?? TXTYPE_CFG.ajustement;
                              const Icon = cfg.icon;
                              const sign = tx.points > 0 ? '+' : '';
                              return (
                                <div key={tx._id} className="flex items-center gap-3 px-4 py-3">
                                  <div className={`w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-body text-sm text-foreground truncate">{tx.description}</p>
                                    <p className="font-body text-[11px] text-muted-foreground">
                                      {new Date(tx.createdAt).toLocaleDateString('fr-FR')}
                                      {' · '}Solde après : {tx.soldeApres.toLocaleString('fr-FR')} pts
                                    </p>
                                  </div>
                                  <span className={`font-display text-base shrink-0 ${tx.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {sign}{tx.points.toLocaleString('fr-FR')} pts
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Abonnement ─── */}
                  {activeTab === 'abonnement' && (
                    <motion.div
                      key="abonnement"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                    >
                      {!user.subscription || user.subscription.status === 'cancelled' ? (
                        <div className="p-6">
                          <div className="relative overflow-hidden rounded-2xl h-40 mb-6">
                            <img src="https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80" alt="Abonnement" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-0 left-0 p-5">
                              <p className="font-display text-2xl text-white">Abonnements La Délicieuse Diète</p>
                              <p className="font-body text-white/70 text-sm">Livraisons hebdomadaires · −20 % annuel · Points ×2</p>
                            </div>
                          </div>
                          <Link to="/abonnement" className="flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl">
                            Découvrir les formules <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-5">
                          <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 pt-6 pb-5 border-b border-border">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                  <PlanIcon className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                  <p className="font-display text-2xl text-foreground">{user.subscription.planName}</p>
                                  <p className="font-body text-xs text-muted-foreground mt-0.5">
                                    {user.subscription.billing === 'annual' ? 'Facturation annuelle · −20 %' : 'Facturation mensuelle'}
                                  </p>
                                </div>
                              </div>
                              <span className={`font-body text-xs px-3 py-1.5 rounded-full border shrink-0 mt-1 ${SUB_STATUS[user.subscription.status].cls}`}>
                                {SUB_STATUS[user.subscription.status].label}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 px-6">
                            <div className="bg-muted rounded-xl px-4 py-3">
                              <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">Montant / mois</p>
                              <p className="font-display text-xl text-primary">{new Intl.NumberFormat('fr-FR').format(user.subscription.price)} FCFA</p>
                            </div>
                            <div className="bg-muted rounded-xl px-4 py-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <CalendarDays className="w-3 h-3 text-muted-foreground" />
                                <p className="font-body text-xs text-muted-foreground uppercase tracking-wider">Renouvellement</p>
                              </div>
                              <p className="font-body text-sm text-foreground">{user.subscription.nextRenewal}</p>
                            </div>
                          </div>

                          <AnimatePresence mode="wait">
                            {!cancelConfirm ? (
                              <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2 px-6 pb-6">
                                {user.subscription.status === 'active' && (
                                  <button onClick={pauseSubscription} className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-4 py-2.5 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                                    <PauseCircle className="w-3.5 h-3.5" />Mettre en pause
                                  </button>
                                )}
                                {user.subscription.status === 'paused' && (
                                  <button onClick={resumeSubscription} className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-primary hover:bg-primary/20 transition-colors">
                                    <PlayCircle className="w-3.5 h-3.5" />Reprendre
                                  </button>
                                )}
                                <Link to="/abonnement" className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-4 py-2.5 border border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                                  Changer de formule
                                </Link>
                                <button onClick={() => setCancelConfirm(true)} className="flex items-center gap-1.5 font-body text-xs uppercase tracking-wider px-4 py-2.5 border border-border rounded-xl text-muted-foreground hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors">
                                  <XCircle className="w-3.5 h-3.5" />Annuler l'abonnement
                                </button>
                              </motion.div>
                            ) : (
                              <motion.div key="confirm" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="border border-red-200 bg-red-50 rounded-xl p-4 flex flex-col gap-4 mx-6 mb-6">
                                <div className="flex items-start gap-3">
                                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-body text-sm font-semibold text-red-700">Confirmer l'annulation</p>
                                    <p className="font-body text-xs text-red-600/80 mt-0.5 leading-relaxed">Votre abonnement sera immédiatement désactivé. Cette action est irréversible.</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={handleCancelSub} className="flex-1 font-body text-xs uppercase tracking-wider py-2.5 bg-red-500 text-white hover:bg-red-600 transition-colors rounded-xl">Oui, annuler</button>
                                  <button onClick={() => setCancelConfirm(false)} className="flex-1 font-body text-xs uppercase tracking-wider py-2.5 border border-border bg-white text-foreground hover:bg-muted transition-colors rounded-xl">Non, garder</button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}
                  {/* ─── Préférences alimentaires ─── */}
                  {activeTab === 'preferences' && (
                    <motion.div
                      key="preferences"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="p-6 flex flex-col gap-6"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <UtensilsCrossed className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-display text-xl text-foreground">Préférences alimentaires</h3>
                          <p className="font-body text-sm text-muted-foreground mt-0.5 leading-relaxed">
                            Indiquez vos restrictions et préférences. Elles nous permettent de mieux vous conseiller.
                          </p>
                        </div>
                      </div>

                      {prefLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {PREF_OPTIONS.map(opt => {
                            const active = prefSelected.includes(opt.key);
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => togglePref(opt.key)}
                                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all
                                  ${active
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                                    : 'border-border hover:border-primary/40 bg-background'
                                  }`}
                              >
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors
                                  ${active ? 'bg-primary border-primary' : 'bg-background border-border'}`}
                                >
                                  {active && <Check className="w-3 h-3 text-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`font-body text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                                  <p className="font-body text-xs text-muted-foreground">{opt.desc}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <button
                        onClick={handleSavePreferences}
                        disabled={prefSaving || prefLoading}
                        className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] py-3.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors rounded-xl"
                      >
                        {prefSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Enregistrer mes préférences
                      </button>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              <div className="flex justify-center pt-2">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-8 py-3 border border-border text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors rounded-xl"
                >
                  <Home className="w-4 h-4" />
                  Retour à l'accueil
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
