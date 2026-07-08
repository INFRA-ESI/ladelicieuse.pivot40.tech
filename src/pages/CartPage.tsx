import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ss } from '@/lib/storage';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { formatPrice } from '@/data/products';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { STORE_WHATSAPP } from '@/lib/config';
import {
  CheckCircle, Check, Sparkles, Star, Printer, ArrowRight, X,
  Leaf, Droplets, UtensilsCrossed, Stethoscope, RotateCcw,
  Trash2, Plus, Minus, AlertTriangle, MessageCircle,
  Truck, Package, MapPin, Calendar, Clock,
} from 'lucide-react';
import { PaymentMethods } from '@/components/payment';
import { toast } from 'sonner';
import Footer from '@/components/Footer';

const CART_HERO = 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1920&q=80';

// ─── Cartographie des zones de livraison de Libreville ────────────────────────

const ZONES_PERIPHERIE_DEFAULT: Array<{ keywords: string[]; label: string; frais: number }> = [
  { keywords: ['owendo'],                                        label: 'Owendo',          frais: 3000 },
  { keywords: ['akanda'],                                        label: 'Akanda',          frais: 3000 },
  { keywords: ['angondje', 'angondjé'],                          label: 'Angondjé',        frais: 3000 },
  { keywords: ['plein-ciel', 'plein ciel', 'pleinciel'],         label: 'Plein-Ciel',      frais: 3000 },
  { keywords: ['avorbam'],                                       label: 'Avorbam',         frais: 3000 },
  { keywords: ['bikele', 'bikélé'],                              label: 'Bikélé',          frais: 3000 },
  { keywords: ['nzeng-ayong', 'nzeng ayong', 'nzeng'],           label: 'Nzeng-Ayong',     frais: 3000 },
  { keywords: ['aworongane'],                                    label: 'Aworongane',      frais: 3000 },
  { keywords: ['mindoube', 'mindoubé'],                          label: 'Mindoubé',        frais: 3000 },
  { keywords: ['alibandeng'],                                    label: 'Alibandeng',      frais: 3000 },
  { keywords: ['cite scientifique', 'cité scientifique'],        label: 'Cité Scientifique', frais: 3000 },
  { keywords: ['pk5','pk 5','pk6','pk 6','pk7','pk 7','pk8','pk 8',
               'pk9','pk 9','pk10','pk 10','pk11','pk 11','pk12','pk 12',
               'pk13','pk 13','pk14','pk 14','pk15','pk 15'],     label: 'Zone PK5+',       frais: 3000 },
];

const DELIVERY_SLOTS_DEFAULT: string[] = [
  '09h00', '10h00', '11h00', '12h00',
  '13h00', '14h00', '15h00', '16h00',
  '17h00', '18h00', '19h00', '20h00',
];

function getZoneInfo(
  address: string,
  zones: Array<{ keywords: string[]; label: string; frais: number }>,
): { label: string; fee: number } | null {
  if (!address.trim()) return null;
  const lower = address.toLowerCase();
  for (const z of zones) {
    if (z.keywords.some((kw: string) => lower.includes(kw))) {
      return { label: z.label, fee: z.frais };
    }
  }
  return { label: 'Libreville', fee: 2000 };
}

// ─── Date / heure ─────────────────────────────────────────────────────────────

// Retourne la date locale au format YYYY-MM-DD sans conversion UTC.
// toISOString() convertit en UTC et peut retourner le jour précédent pour les
// fuseaux UTC+ (ex: minuit local = 23h00 UTC J-1 en UTC+1 Gabon).
function toLocalDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function getNextDays(count = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      value: toLocalDateStr(d),
      label: i === 0 ? "Aujourd'hui"
           : i === 1 ? 'Demain'
           : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  });
}

function isSlotAvailable(slot: string, selectedDate: string): boolean {
  const today = toLocalDateStr(new Date());
  if (selectedDate !== today) return true;
  const hour = parseInt(slot.replace('h', ''), 10);
  const slotTime = new Date();
  slotTime.setHours(hour, 0, 0, 0);
  return slotTime.getTime() > Date.now() + 60 * 60 * 1000;
}

function formatDeliveryDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPoints(total: number) {
  return Math.floor(total / 100);
}

function buildWhatsAppMessage(
  orderId: string,
  items: { name: string; qty: number; price: number }[],
  total: number,
  nom: string,
  delivery?: { mode: 'livraison' | 'retrait'; address?: string; date?: string; time?: string; fee?: number },
) {
  const lines = items.map(i => `  • ${i.name} × ${i.qty} — ${formatPrice(i.price * i.qty)}`).join('\n');
  const deliveryLine = delivery?.mode === 'livraison'
    ? `\n*Livraison :* ${delivery.address} — ${formatDeliveryDate(delivery.date ?? '')} · ${delivery.time}\n*Frais de livraison :* ${formatPrice(delivery.fee ?? 0)}\n`
    : delivery?.mode === 'retrait' ? '\n*Mode :* Récupération sur place\n' : '';
  return encodeURIComponent(
    `*La Délicieuse Diète — Confirmation de commande*\n\n` +
    `Bonjour ${nom} ! Votre commande #${orderId.slice(-8).toUpperCase()} a bien été reçue.\n\n` +
    `*Articles :*\n${lines}\n${deliveryLine}\n` +
    `*Total :* ${formatPrice(total)}\n\n` +
    `Merci pour votre confiance ! Nous préparons votre commande.`,
  );
}

// ─── Item type config ─────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; icon: React.ElementType; stripe: string; pill: string; text: string }> = {
  salade:       { label: 'Salade',       icon: Leaf,            stripe: 'bg-green-500',  pill: 'bg-green-50 border-green-200',  text: 'text-green-700' },
  jus:          { label: 'Jus',          icon: Droplets,        stripe: 'bg-sky-500',    pill: 'bg-sky-50 border-sky-200',      text: 'text-sky-700' },
  repas:        { label: 'Repas',        icon: UtensilsCrossed, stripe: 'bg-orange-500', pill: 'bg-orange-50 border-orange-200',text: 'text-orange-700' },
  consultation: { label: 'Consultation', icon: Stethoscope,     stripe: 'bg-violet-500', pill: 'bg-violet-50 border-violet-200',text: 'text-violet-700' },
  reorder:      { label: 'Commande',     icon: RotateCcw,       stripe: 'bg-primary',    pill: 'bg-primary/5 border-primary/20',text: 'text-primary' },
};

function getTypeCfg(type: string) {
  return TYPE_CFG[type] ?? TYPE_CFG['salade'];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPrice, totalCalories, totalItems, clearCart } = useCart();
  const { user, addOrder } = useUser();
  const navigate = useNavigate();
  const [zones, setZones] = useState(ZONES_PERIPHERIE_DEFAULT);

  // ── Confirmation snapshot ────────────────────────────────────────────────────
  const [orderConfirmed, setOrderConfirmed]     = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState('');
  const [pendingOrderId, setPendingOrderId]     = useState('');
  const [confirmedItems, setConfirmedItems]     = useState<typeof items>([]);
  const [confirmedTotal, setConfirmedTotal]     = useState(0);
  const [confirmedMode, setConfirmedMode]       = useState('');
  const [confirmedAt, setConfirmedAt]           = useState('');
  const [confirmedDelivery, setConfirmedDelivery] = useState<null | { mode: 'livraison' | 'retrait'; address?: string; date?: string; time?: string; fee?: number }>(null);

  // ── Checkout ─────────────────────────────────────────────────────────────────
  const [checkoutOpen, setCheckoutOpen]   = useState(false);
  const [checkoutStep, setCheckoutStep]   = useState<'info' | 'payment'>('info');
  const [nom, setNom]                     = useState(user?.nom ?? '');
  const [prenoms, setPrenoms]             = useState(user?.prenoms ?? '');
  const [telephone, setTelephone]         = useState(user?.telephone ?? '');
  const [infoError, setInfoError]         = useState('');

  // ── Livraison ────────────────────────────────────────────────────────────────
  const [deliveryMode, setDeliveryMode]       = useState<'livraison' | 'retrait' | null>(null);
  const [deliveryDate, setDeliveryDate]       = useState('');
  const [deliveryTime, setDeliveryTime]       = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliverySlots, setDeliverySlots]     = useState<string[]>(DELIVERY_SLOTS_DEFAULT);

  useEffect(() => {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), 8000);

    fetch('/api/settings/public', { signal: ac.signal })
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data?.creneauxLivraison) && json.data.creneauxLivraison.length > 0) {
          setDeliverySlots(json.data.creneauxLivraison);
        }
        if (json.success && Array.isArray(json.data?.zonesLivraison) && json.data.zonesLivraison.length > 0) {
          setZones(json.data.zonesLivraison);
        }
      })
      .catch((err) => { if (err.name !== 'AbortError') console.warn('[CartPage] /api/settings :', err); });

    return () => { clearTimeout(tid); ac.abort(); };
  }, []);

  const [clearConfirm, setClearConfirm] = useState(false);

  const receiptRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (user) { setNom(user.nom); setPrenoms(user.prenoms || ''); setTelephone(user.telephone); }
  }, [user]);

  useEffect(() => {
    if (searchParams.get('payment') !== 'success') return;

    // Read saved checkout data directly — do NOT go through setState (async, would be stale)
    let ov: Partial<{
      pendingOrderId: string; nom: string; prenoms: string; telephone: string;
      deliveryMode: 'livraison' | 'retrait' | null;
      deliveryDate: string; deliveryTime: string; deliveryAddress: string;
      deliveryFee: number; orderTotal: number;
    }> = {};
    const savedRaw = ss.get('pending_checkout');
    ss.remove('pending_checkout');
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);
        ov = {
          pendingOrderId: saved.pendingOrderId,
          nom:            saved.nom,
          prenoms:        saved.prenoms,
          telephone:      saved.telephone,
          deliveryMode:   saved.deliveryMode,
          deliveryDate:   saved.deliveryDate,
          deliveryTime:   saved.deliveryTime,
          deliveryAddress: saved.deliveryAddress,
          deliveryFee:    saved.deliveryFee,
          orderTotal:     saved.orderTotal,
        };
      } catch { /* ignore malformed sessionStorage data */ }
    }

    const txnId = ss.get('singpay_txn');
    ss.remove('singpay_txn');
    ss.remove('singpay_order');

    if (txnId) {
      fetch(`/api/payments/singpay/check/${txnId}`)
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data?.status === 'success') {
            finishOrder('Carte bancaire', ov);
          } else {
            navigate('/paiement/echec');
          }
        })
        .catch(() => navigate('/paiement/echec'));
    } else {
      navigate('/paiement/echec');
    }
  }, []); // runs once on mount — handles redirect-back from card payment gateway

  // Clear stale checkout data when user arrives at cart without completing payment
  useEffect(() => {
    if (searchParams.get('payment') === 'success') return; // payment handler takes care of cleanup
    ss.remove('pending_checkout');
    ss.remove('singpay_txn');
    ss.remove('singpay_order');
  }, []); // runs once on mount

  // ── Delivery fee computation ─────────────────────────────────────────────────
  const zoneInfo = useMemo(() => {
    if (deliveryMode !== 'livraison') return null;
    return getZoneInfo(deliveryAddress, zones);
  }, [deliveryMode, deliveryAddress, zones]);

  const deliveryFee  = zoneInfo?.fee   ?? 0;
  const deliveryZone = zoneInfo?.label ?? null;

  const orderTotal = totalPrice + deliveryFee;

  // ── Notifications + finalisation commande ────────────────────────────────────
  const fullName = user
    ? [user.prenoms, user.nom].filter(Boolean).join(' ')
    : [prenoms, nom].filter(Boolean).join(' ') || nom;

  const finishOrder = async (mode = 'En ligne', ov: Partial<{
    pendingOrderId: string; nom: string; prenoms: string; telephone: string;
    deliveryMode: 'livraison' | 'retrait' | null;
    deliveryDate: string; deliveryTime: string; deliveryAddress: string;
    deliveryFee: number; orderTotal: number;
  }> = {}) => {
    // Capture snapshot immédiatement avant toute opération async
    const itemsSnapshot = [...items];

    const _id     = ov.pendingOrderId ?? pendingOrderId ?? `ORDER-${Date.now()}`;
    const _nom    = (ov.nom     ?? user?.nom     ?? nom).trim();
    const _pre    = (ov.prenoms ?? user?.prenoms ?? prenoms).trim();
    const _phone  = (ov.telephone ?? user?.telephone ?? telephone).trim();
    const _dMode  = ('deliveryMode' in ov) ? ov.deliveryMode! : deliveryMode;
    const _dDate  = ov.deliveryDate  ?? deliveryDate;
    const _dTime  = ov.deliveryTime  ?? deliveryTime;
    const _dAddr  = (ov.deliveryAddress ?? deliveryAddress).trim();
    const _dFee   = ov.deliveryFee  ?? deliveryFee;
    const _total  = ov.orderTotal   ?? (totalPrice + _dFee);
    const _name   = [_pre, _nom].filter(Boolean).join(' ') || _nom;

    const now     = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const pts     = calcPoints(_total);
    const snap    = _dMode ? { mode: _dMode, address: _dAddr, date: _dDate, time: _dTime, fee: _dFee } : null;
    const sousTotal = itemsSnapshot.reduce((s, i) => s + i.totalPrice * i.quantity, 0);

    const modePaiementMap: Record<string, 'mobile_money' | 'carte' | 'especes'> = {
      'Airtel Money': 'mobile_money', 'Moov Money': 'mobile_money',
      'Carte bancaire': 'carte', 'En ligne': 'carte',
    };
    const modePaiementCode = modePaiementMap[mode] ?? 'especes';

    // Afficher l'écran de confirmation immédiatement (optimiste)
    setConfirmedItems(itemsSnapshot);
    setConfirmedTotal(_total);
    setConfirmedMode(mode);
    setConfirmedAt(`${dateStr} à ${timeStr}`);
    setConfirmedOrderId(_id);
    setConfirmedDelivery(snap as typeof confirmedDelivery);
    setCheckoutOpen(false);
    setOrderConfirmed(true);
    setTimeout(() => clearCart(), 1500);

    // Mise à jour locale du contexte utilisateur
    addOrder({
      id: _id,
      date: dateStr,
      items: itemsSnapshot.map(i => ({ name: i.name, qty: i.quantity, price: i.totalPrice })),
      total: _total,
      statut: 'en_attente',
      modePaiement: modePaiementCode,
      modeCommande: _dMode === 'retrait' ? 'sur_place' : 'livraison',
      pointsGagnes: pts,
    });

    // Sauvegarde en base — chemin critique, erreurs visibles
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: {
            nom: _nom,
            prenoms: _pre,
            email: user?.email ?? '',
            telephone: _phone,
            adresse: _dMode === 'livraison' ? _dAddr : 'Sur place',
          },
          userId: user?.id ?? undefined,
          items: itemsSnapshot.map(i => ({
            nom: i.name,
            qty: i.quantity,
            prix: i.totalPrice,
            customizations: [],
          })),
          statut: 'en_attente',
          priorite: 'normale',
          modeCommande: _dMode === 'retrait' ? 'sur_place' : 'livraison',
          modePaiement: modePaiementCode,
          sousTotal,
          fraisLivraison: _dFee,
          total: _total,
          datelivraison:    _dMode === 'livraison' && _dDate ? _dDate : undefined,
          creneauLivraison: _dMode === 'livraison' && _dTime ? _dTime : undefined,
          notes: '',
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data?.numero) {
        // Mettre à jour l'ID avec le vrai numéro de la DB (CMD-XXXX)
        setConfirmedOrderId(json.data.numero);
      } else if (!res.ok) {
        toast.error(
          'Commande confirmée mais l\'enregistrement a échoué. Appelez-nous pour confirmer.',
          { duration: 10000 }
        );
        console.error('[CartPage] Échec sauvegarde commande:', json?.message);
      }
    } catch (err) {
      toast.error(
        'Erreur réseau — commande non enregistrée. Appelez-nous pour confirmer.',
        { duration: 10000 }
      );
      console.error('[CartPage] Erreur réseau sauvegarde commande:', err);
    }

    // Notification WhatsApp — fire-and-forget (secondaire)
    fetch('/api/notifications/whatsapp/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: _id,
        customerName: _name,
        customerPhone: _phone,
        items: itemsSnapshot.map(i => ({ name: i.name, qty: i.quantity, price: i.totalPrice })),
        total: _total,
        modePaiement: mode,
        delivery: _dMode ? { mode: _dMode, address: _dAddr, date: _dDate, time: _dTime, fee: _dFee } : undefined,
      }),
    }).catch(err => console.warn('[CartPage] WhatsApp notification :', err));
  };

  const openCheckout = () => {
    setPendingOrderId(`ORDER-${Date.now()}`);
    setInfoError('');
    setNom(user?.nom ?? '');
    setPrenoms(user?.prenoms ?? '');
    setTelephone(user?.telephone ?? '');
    setDeliveryMode(null);
    setDeliveryDate('');
    setDeliveryTime('');
    setDeliveryAddress('');
    setCheckoutStep('info');
    setCheckoutOpen(true);
  };

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInfoError('');
    if (!nom.trim() || !telephone.trim()) {
      setInfoError('Veuillez renseigner votre nom et votre numéro de téléphone.');
      return;
    }

    if (!deliveryMode) {
      setInfoError('Veuillez choisir entre livraison et récupération sur place.');
      return;
    }
    if (deliveryMode === 'livraison') {
      if (!deliveryDate)            { setInfoError('Veuillez choisir une date de livraison.'); return; }
      if (!deliveryTime)            { setInfoError('Veuillez choisir un créneau horaire.'); return; }
      if (!deliveryAddress.trim())  { setInfoError('Veuillez indiquer votre adresse de livraison.'); return; }
    }
    // Persist checkout data before potential card redirect
    ss.set('pending_checkout', JSON.stringify({
      nom: nom.trim(),
      prenoms: prenoms.trim(),
      telephone: telephone.trim(),
      deliveryMode,
      deliveryDate,
      deliveryTime,
      deliveryAddress,
      deliveryFee,
      orderTotal,
      pendingOrderId,
    }));
    setCheckoutStep('payment');
  };

  const handleClearCart = () => {
    clearCart();
    setClearConfirm(false);
    setCheckoutOpen(false);
  };

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const html = receiptRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=600,height=800');
    if (!win) return;
    win.document.write(`
      <html><head><title>Reçu — La Délicieuse Diète</title>
      <style>
        body { font-family: Georgia, serif; padding: 32px; color: #1a1a1a; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; padding-bottom: 8px; border-bottom: 1px solid #eee; }
        td { padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f5f5f5; }
        .total td { font-weight: bold; font-size: 15px; border-top: 2px solid #1a1a1a; border-bottom: none; }
        .pts { background: #fef9ee; border: 1px solid #f5e0a0; padding: 10px; border-radius: 8px; font-size: 12px; color: #92400e; margin-top: 12px; }
      </style></head>
      <body>${html}</body></html>
    `);
    win.document.close();
    win.print();
  };

  // ── Confirmation ─────────────────────────────────────────────────────────────

  if (orderConfirmed) {
    const short = confirmedOrderId.slice(-8).toUpperCase();
    const pts   = calcPoints(confirmedTotal);
    const waMsg = buildWhatsAppMessage(
      confirmedOrderId,
      confirmedItems.map(i => ({ name: i.name, qty: i.quantity, price: i.totalPrice })),
      confirmedTotal,
      fullName || nom,
      confirmedDelivery ?? undefined,
    );
    const waUrl = `https://wa.me/${STORE_WHATSAPP}?text=${waMsg}`;

    return (
      <>
      <div className="min-h-screen pt-24 pb-20 bg-muted/20 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="relative flex items-center justify-center mb-10">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <CheckCircle className="w-14 h-14 text-primary" />
            </motion.div>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 0, x: 0 }}
                animate={{ opacity: [0, 1, 0], y: -90, x: (i - 2.5) * 34 }}
                transition={{ delay: 0.2 + i * 0.09, duration: 1.2 }}
                className="absolute"
              >
                <Sparkles className="w-5 h-5 text-secondary" />
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-10"
          >
            <h1 className="font-display text-4xl md:text-5xl text-foreground mb-3">Commande confirmée</h1>
            <p className="font-body text-lg text-muted-foreground">
              Merci, <span className="text-foreground font-medium">{fullName || nom}</span> — on s'occupe de tout.
            </p>
            <p className="font-body text-sm text-muted-foreground mt-2">
              Référence <span className="font-semibold text-foreground tracking-wider">#{short}</span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <div className="border border-border rounded-2xl bg-background overflow-hidden mb-6">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <h2 className="font-display text-xl text-foreground">Reçu de commande</h2>
                  <p className="font-body text-xs text-muted-foreground mt-0.5">#{short}</p>
                </div>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 font-body text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded-lg px-3 py-2"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer
                </button>
              </div>

              <div ref={receiptRef} className="px-6 py-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-5 pb-5 border-b border-border">
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Référence</p>
                    <p className="font-body text-sm font-semibold text-foreground">#{short}</p>
                  </div>
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Date &amp; heure</p>
                    <p className="font-body text-sm text-foreground">{confirmedAt}</p>
                  </div>
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Client</p>
                    <p className="font-body text-sm text-foreground">{fullName || nom}</p>
                  </div>
                  <div>
                    <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Paiement</p>
                    <p className="font-body text-sm text-foreground">{confirmedMode}</p>
                  </div>
                  {confirmedDelivery && (
                    <div className="col-span-2">
                      <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground">Livraison</p>
                      <p className="font-body text-sm text-foreground">
                        {confirmedDelivery.mode === 'livraison'
                          ? `${confirmedDelivery.address} · ${formatDeliveryDate(confirmedDelivery.date ?? '')} à ${confirmedDelivery.time}`
                          : 'Récupération sur place'}
                      </p>
                    </div>
                  )}
                </div>

                <table className="w-full mb-5">
                  <thead>
                    <tr>
                      <th className="text-left font-body text-[10px] text-muted-foreground uppercase tracking-wider pb-3 border-b border-border">Article</th>
                      <th className="text-center font-body text-[10px] text-muted-foreground uppercase tracking-wider pb-3 border-b border-border">Qté</th>
                      <th className="text-right font-body text-[10px] text-muted-foreground uppercase tracking-wider pb-3 border-b border-border">Prix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedItems.map(item => (
                      <tr key={item.id}>
                        <td className="py-2.5 font-body text-sm text-foreground">{item.name}</td>
                        <td className="py-2.5 font-body text-sm text-center text-muted-foreground">{item.quantity}</td>
                        <td className="py-2.5 font-body text-sm text-right text-muted-foreground">
                          {formatPrice(item.totalPrice * item.quantity)}
                        </td>
                      </tr>
                    ))}
                    {confirmedDelivery?.mode === 'livraison' && (confirmedDelivery.fee ?? 0) > 0 && (
                      <tr>
                        <td className="py-2.5 font-body text-sm text-muted-foreground" colSpan={2}>Frais de livraison</td>
                        <td className="py-2.5 font-body text-sm text-right text-muted-foreground">{formatPrice(confirmedDelivery.fee ?? 0)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={2} className="pt-4 pb-1 font-display text-xl text-foreground border-t border-border">Total</td>
                      <td className="pt-4 pb-1 font-display text-xl text-right text-primary border-t border-border">{formatPrice(confirmedTotal)}</td>
                    </tr>
                  </tbody>
                </table>
                {pts > 0 && user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                    <p className="font-body text-sm text-amber-800">
                      <strong>+{pts} points fidélité</strong> crédités sur cette commande
                    </p>
                  </div>
                )}
                {pts > 0 && !user && (
                  <div className="bg-muted border border-border rounded-xl px-4 py-3 flex items-center gap-2.5">
                    <Star className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="font-body text-sm text-muted-foreground">
                      <Link to="/mon-compte" className="font-medium text-primary hover:underline">Créez un compte</Link> pour gagner <strong>{pts} points</strong> fidélité sur vos prochaines commandes.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 bg-[#25D366] text-white hover:opacity-90 transition-opacity rounded-xl"
              >
                <MessageCircle className="w-4 h-4" />
                Confirmation WhatsApp
              </a>
              {user && (
                <Link
                  to="/mon-compte"
                  className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 border border-primary text-primary hover:bg-primary/5 transition-colors rounded-xl"
                >
                  Suivre ma commande <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <Link to="/" className="w-full text-center font-body text-sm text-muted-foreground hover:text-foreground transition-colors py-3">
                Retour à l'accueil
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
      </>
    );
  }

  // ── Panier ───────────────────────────────────────────────────────────────────

  const pts = calcPoints(totalPrice);
  const isEmpty = items.length === 0;

  return (
    <div className="min-h-screen">

      {/* Hero */}
      <section className="relative h-screen flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={CART_HERO} alt="Votre panier" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/25 to-transparent" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 pb-16 md:pb-24"
        >
          <span className="font-body text-xs uppercase tracking-[0.3em] text-primary mb-4 block">
            {isEmpty ? 'Panier' : `${totalItems} article${totalItems > 1 ? 's' : ''} sélectionné${totalItems > 1 ? 's' : ''}`}
          </span>
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] mb-6">
            {isEmpty ? (
              <>Le plaisir<br /><span className="italic">commence ici</span></>
            ) : (
              <>Finalisez<br /><span className="italic">votre commande</span></>
            )}
          </h1>
          <p className="font-display text-xl md:text-2xl text-primary-foreground/75 italic max-w-xl mb-10">
            {isEmpty
              ? 'Choisissez parmi nos salades, jus, repas chauds, omelettes et soupes.'
              : `${formatPrice(totalPrice)} · Livraison calculée selon votre zone`}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {isEmpty ? (
              <Link to="/composer" className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
                Découvrir la carte
              </Link>
            ) : (
              <>
                <a href="#panier" className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 bg-primary text-primary-foreground hover:bg-tomato-dark transition-colors rounded-xl">
                  Voir mon panier
                </a>
                <button onClick={openCheckout} className="font-body text-sm uppercase tracking-[0.2em] px-8 py-4 border border-white/40 text-white hover:bg-white/10 transition-colors rounded-xl">
                  Commander
                </button>
              </>
            )}
          </div>
        </motion.div>
      </section>

      {isEmpty ? (
        <div className="bg-muted/20 pb-20">
          <div className="max-w-3xl mx-auto px-6 pt-16">
            <div className="grid md:grid-cols-2 gap-5">
              {[
                { to: '/composer', label: 'À Commander', sub: 'Salades, jus, repas, omelettes & soupes', img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80' },
                { to: '/jus', label: 'Jus & Détox', sub: 'Pressés à la commande, pleins de vitalité', img: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?auto=format&fit=crop&w=600&q=80' },
                { to: '/repas', label: 'Repas Chauds', sub: 'Omelettes, soupes, plats mijotés', img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80' },
                { to: '/dieteticien', label: 'Diététicien', sub: 'Conseil nutritionnel personnalisé', img: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=600&q=80' },
              ].map(({ to, label, sub, img }, i) => (
                <motion.div key={to} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Link to={to} className="block group relative overflow-hidden rounded-2xl h-44 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
                    <img src={img} alt={label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-5 text-white">
                      <h3 className="font-display text-xl mb-0.5">{label}</h3>
                      <p className="font-body text-white/70 text-xs">{sub}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div id="panier" className="bg-muted/20 pb-32 scroll-mt-0">
          <div className="max-w-5xl mx-auto px-6 pt-16">
            <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-10 items-start">

              {/* Articles */}
              <div className="flex flex-col gap-4 mb-8 lg:mb-0">
                <AnimatePresence initial={false}>
                  {items.map((item, idx) => {
                    const cfg = getTypeCfg(item.type);
                    const TypeIcon = cfg.icon;
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -24, height: 0, marginBottom: 0 }}
                        transition={{ delay: idx * 0.05, exit: { duration: 0.2 } }}
                        className="bg-background border border-border rounded-2xl overflow-hidden flex"
                      >
                        <div className={`w-1 shrink-0 ${cfg.stripe}`} />
                        <div className="flex-1 p-5 md:p-6">
                          <div className="flex items-start justify-between mb-3">
                            <span className={`inline-flex items-center gap-1.5 font-body text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border ${cfg.pill} ${cfg.text}`}>
                              <TypeIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors -mt-0.5 -mr-0.5"
                              aria-label="Retirer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <h3 className="font-display text-xl md:text-2xl text-foreground leading-tight mb-2">{item.name}</h3>
                          {item.items && item.items.filter(i => i.ingredient).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {item.items.filter(i => i.ingredient).map(i => (
                                <span
                                  key={i.ingredient.id}
                                  className="inline-flex items-center gap-1.5 font-body text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded-full font-medium"
                                >
                                  {i.ingredient.image && (
                                    <img src={i.ingredient.image} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                                  )}
                                  {i.ingredient.name}
                                  {i.quantity > 1 && (
                                    <span className="text-primary/50 font-normal">×{i.quantity}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                            <div className="flex items-center gap-3">
                              {item.totalCalories > 0 && (
                                <span className="font-body text-xs text-muted-foreground">{item.totalCalories * item.quantity} cal</span>
                              )}
                              <div className="flex items-center gap-1 border border-border rounded-full px-1 py-0.5">
                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-6 text-center font-body text-sm font-semibold text-foreground">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="text-right">
                              {item.quantity > 1 && (
                                <p className="font-body text-xs text-muted-foreground mb-0.5">{formatPrice(item.totalPrice)} / unité</p>
                              )}
                              <p className="font-display text-xl text-foreground">{formatPrice(item.totalPrice * item.quantity)}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

              </div>

              {/* Récapitulatif */}
              <div className="lg:sticky lg:top-28">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-background border border-border rounded-2xl overflow-hidden"
                >
                  <div className="px-6 pt-6 pb-4 border-b border-border">
                    <h2 className="font-display text-2xl text-foreground">Récapitulatif</h2>
                  </div>
                  <div className="px-6 py-4 flex flex-col gap-2.5">
                    {items.map(item => (
                      <div key={item.id} className="flex items-baseline justify-between gap-3">
                        <span className="font-body text-sm text-muted-foreground truncate flex-1">
                          {item.name}
                          {item.quantity > 1 && <span className="ml-1.5 text-xs">× {item.quantity}</span>}
                        </span>
                        <span className="font-body text-sm text-foreground shrink-0">{formatPrice(item.totalPrice * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  {pts > 0 && (
                    <div className="mx-6 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                      <p className="font-body text-sm text-amber-800">
                        <strong>+{pts} points</strong> fidélité avec cette commande
                      </p>
                    </div>
                  )}
                  <div className="px-6 pt-4 pb-4 border-t border-border flex flex-col gap-2">
                    {totalCalories > 0 && (
                      <div className="flex justify-between font-body text-sm text-muted-foreground">
                        <span>Calories totales</span>
                        <span>{totalCalories} cal</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline">
                      <span className="font-display text-2xl text-foreground">Total</span>
                      <span className="font-display text-3xl text-primary">{formatPrice(totalPrice)}</span>
                    </div>
                  </div>
                  <div className="px-6 pb-6 pt-2 flex flex-col gap-2.5">

                    {/* Finaliser — CTA primaire */}
                    <button
                      onClick={openCheckout}
                      className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all rounded-xl shadow-sm"
                    >
                      Finaliser la commande
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    {/* Continuer mes achats — secondaire */}
                    <Link
                      to="/composer"
                      className="flex items-center justify-center py-3.5 px-4 font-body text-[11px] uppercase tracking-[0.08em] border border-border rounded-xl text-foreground hover:border-primary hover:text-primary hover:bg-primary/5 active:scale-[0.97] transition-all duration-200 text-center leading-snug"
                    >
                      Continuer mes achats
                    </Link>

                    {/* Vider le panier — destructif */}
                    <AnimatePresence mode="wait">
                      {!clearConfirm ? (
                        <motion.button
                          key="clear-btn"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setClearConfirm(true)}
                          className="w-full flex items-center justify-center gap-1.5 font-body text-xs uppercase tracking-[0.1em] py-3 border border-border rounded-xl text-muted-foreground hover:border-red-200 hover:text-red-500 hover:bg-red-50/60 active:scale-[0.98] transition-all duration-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Vider le panier
                        </motion.button>
                      ) : (
                        <motion.div
                          key="clear-confirm"
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                        >
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="font-body text-sm text-red-700 flex-1">Vider le panier ?</span>
                          <button
                            onClick={() => { clearCart(); setClearConfirm(false); }}
                            className="font-body text-xs uppercase tracking-wider px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Oui
                          </button>
                          <button
                            onClick={() => setClearConfirm(false)}
                            className="font-body text-xs uppercase tracking-wider px-3 py-1.5 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                          >
                            Non
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <p className="font-body text-xs text-muted-foreground text-center pt-1">
                      Livraison calculée selon votre zone · Paiement sécurisé
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          MODAL CHECKOUT
      ══════════════════════════════════════ */}
      <AnimatePresence>
        {checkoutOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
            onClick={e => { if (e.target === e.currentTarget) setCheckoutOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="bg-background w-full sm:rounded-2xl sm:max-w-lg shadow-elevated overflow-hidden max-h-[92vh] overflow-y-auto"
            >
              {/* En-tête */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-background z-10">
                <div className="flex items-center gap-3">
                  {checkoutStep === 'payment' && (
                    <button
                      onClick={() => setCheckoutStep('info')}
                      className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
                      title="Modifier ma commande"
                    >
                      <ArrowRight className="w-4 h-4 rotate-180" />
                    </button>
                  )}
                  <div>
                    <h2 className="font-display text-2xl text-foreground">
                      {checkoutStep === 'info' ? 'Votre commande' : 'Mode de paiement'}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-2">
                      {(['info', 'payment'] as const).map(s => (
                        <div
                          key={s}
                          className={`h-1 rounded-full transition-all duration-300 ${
                            s === checkoutStep ? 'w-8 bg-primary' :
                            s === 'info' && checkoutStep === 'payment' ? 'w-4 bg-primary/30' :
                            'w-4 bg-border'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCheckoutOpen(false)}
                  className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Mini-récap */}
              <div className="px-6 py-3 bg-muted/40 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm text-muted-foreground">{totalItems} article{totalItems > 1 ? 's' : ''}</span>
                  <span className="font-body text-xs text-muted-foreground">{formatPrice(totalPrice)}</span>
                </div>
                {deliveryMode === 'livraison' && deliveryFee > 0 && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-body text-xs text-muted-foreground">Livraison ({deliveryZone})</span>
                    <span className="font-body text-xs text-muted-foreground">+ {formatPrice(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/60">
                  <span className="font-body text-sm font-semibold text-foreground">Total</span>
                  <span className="font-display text-lg text-primary">{formatPrice(orderTotal)}</span>
                </div>
              </div>

              <AnimatePresence mode="wait">

                {/* ── Étape 1 : Infos + livraison ── */}
                {checkoutStep === 'info' && (
                  <motion.form
                    key="info"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    onSubmit={handleInfoSubmit}
                    className="px-6 py-7 flex flex-col gap-5"
                  >
                    {/* Prénom(s) + Nom + Téléphone */}
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Prénom(s)</label>
                          <input
                            type="text"
                            value={prenoms}
                            onChange={e => { setPrenoms(e.target.value); setInfoError(''); }}
                            placeholder="Votre prénom"
                            autoComplete="given-name"
                            className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                          />
                        </div>
                        <div>
                          <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Nom</label>
                          <input
                            type="text"
                            value={nom}
                            onChange={e => { setNom(e.target.value); setInfoError(''); }}
                            placeholder="Votre nom"
                            autoComplete="family-name"
                            className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-2">Téléphone</label>
                        <input
                          type="tel"
                          value={telephone}
                          onChange={e => { setTelephone(e.target.value); setInfoError(''); }}
                          placeholder="+241 XX XXX XXXX"
                          className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                          required
                        />
                      </div>
                    </div>

                    {/* Mode de livraison */}
                    <div>
                      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-3">
                        Comment souhaitez-vous recevoir votre commande ?
                      </p>
                      <div className="grid grid-cols-2 gap-3">

                        {/* Se faire livrer */}
                        <button
                          type="button"
                          onClick={() => { setDeliveryMode('livraison'); setInfoError(''); }}
                          className={`relative group flex flex-col items-center gap-3 px-4 py-6 rounded-2xl border-2 transition-all duration-200 ${
                            deliveryMode === 'livraison'
                              ? 'border-primary bg-primary/5 shadow-warm'
                              : 'border-border hover:border-primary/40 bg-background hover:bg-muted/30'
                          }`}
                        >
                          {deliveryMode === 'livraison' && (
                            <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                            deliveryMode === 'livraison' ? 'bg-primary/15' : 'bg-muted group-hover:bg-primary/8'
                          }`}>
                            <Truck className={`w-6 h-6 transition-colors ${deliveryMode === 'livraison' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'}`} />
                          </div>
                          <div className="text-center">
                            <span className={`font-display text-base block leading-tight transition-colors ${deliveryMode === 'livraison' ? 'text-primary' : 'text-foreground'}`}>
                              Se faire livrer
                            </span>
                            <span className="font-body text-[11px] text-muted-foreground mt-0.5 block">
                              À votre adresse
                            </span>
                          </div>
                        </button>

                        {/* Récupérer ma commande */}
                        <button
                          type="button"
                          onClick={() => { setDeliveryMode('retrait'); setInfoError(''); }}
                          className={`relative group flex flex-col items-center gap-3 px-4 py-6 rounded-2xl border-2 transition-all duration-200 ${
                            deliveryMode === 'retrait'
                              ? 'border-primary bg-primary/5 shadow-warm'
                              : 'border-border hover:border-primary/40 bg-background hover:bg-muted/30'
                          }`}
                        >
                          {deliveryMode === 'retrait' && (
                            <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                            deliveryMode === 'retrait' ? 'bg-primary/15' : 'bg-muted group-hover:bg-primary/8'
                          }`}>
                            <Package className={`w-6 h-6 transition-colors ${deliveryMode === 'retrait' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70'}`} />
                          </div>
                          <div className="text-center">
                            <span className={`font-display text-base block leading-tight transition-colors ${deliveryMode === 'retrait' ? 'text-primary' : 'text-foreground'}`}>
                              Récupérer
                            </span>
                            <span className="font-body text-[11px] text-muted-foreground mt-0.5 block">
                              Sur place, sans frais
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Champs livraison (révélation progressive) */}
                    <AnimatePresence>
                      {deliveryMode === 'livraison' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="flex flex-col gap-4 overflow-hidden"
                        >
                          {/* Date + Heure côte à côte */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="font-body text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                                <Calendar className="w-3.5 h-3.5" /> Date
                              </label>
                              <select
                                value={deliveryDate}
                                onChange={e => { setDeliveryDate(e.target.value); setDeliveryTime(''); setInfoError(''); }}
                                className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                              >
                                <option value="">Choisir</option>
                                {getNextDays().map(day => (
                                  <option key={day.value} value={day.value}>{day.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="font-body text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                                <Clock className="w-3.5 h-3.5" /> Heure
                              </label>
                              <select
                                value={deliveryTime}
                                onChange={e => { setDeliveryTime(e.target.value); setInfoError(''); }}
                                disabled={!deliveryDate}
                                className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <option value="">Heure</option>
                                {deliverySlots.map(slot => {
                                  const available = isSlotAvailable(slot, deliveryDate);
                                  return (
                                    <option key={slot} value={slot} disabled={!available}>
                                      {slot}{!available ? ' (passé)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          </div>
                          {deliveryDate && deliveryTime && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-primary"
                            >
                              <Check className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-body text-sm">
                                {formatDeliveryDate(deliveryDate)} à {deliveryTime}
                              </span>
                            </motion.div>
                          )}

                          {/* Adresse */}
                          <div>
                            <label className="font-body text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                              <MapPin className="w-3.5 h-3.5" /> Lieu de livraison
                            </label>
                            <input
                              type="text"
                              value={deliveryAddress}
                              onChange={e => { setDeliveryAddress(e.target.value); setInfoError(''); }}
                              placeholder="Ex: Lalala, Batterie 4, Nkembo, PK8…"
                              className="w-full font-body text-sm px-4 py-3.5 border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
                            />
                            <p className="font-body text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                              Zone centre <span className="font-semibold text-foreground">(Glass, Lalala, Batterie 4, Cocotiers…)</span> — 2 000 F<br />
                              Zone périphérie <span className="font-semibold text-foreground">(Owendo, Akanda, PK5+, Nzeng-Ayong…)</span> — 3 000 F
                            </p>
                          </div>

                          {/* Frais affichés automatiquement */}
                          <AnimatePresence>
                            {deliveryAddress.trim() && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                                  deliveryZone && deliveryZone !== 'Libreville'
                                    ? 'bg-orange-50 border-orange-200'
                                    : 'bg-primary/5 border-primary/20'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Truck className={`w-4 h-4 ${deliveryZone && deliveryZone !== 'Libreville' ? 'text-orange-500' : 'text-primary'}`} />
                                  <span className={`font-body text-sm ${deliveryZone && deliveryZone !== 'Libreville' ? 'text-orange-800' : 'text-primary'}`}>
                                    Zone {deliveryZone}
                                  </span>
                                </div>
                                <span className={`font-body text-sm font-bold ${deliveryZone && deliveryZone !== 'Libreville' ? 'text-orange-700' : 'text-primary'}`}>
                                  {formatPrice(deliveryFee)}
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Erreur */}
                    {infoError && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <p className="font-body text-sm text-red-700">{infoError}</p>
                      </div>
                    )}

                    {/* Boutons d'action */}
                    <div className="flex flex-col gap-3 pt-1">
                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 bg-primary text-primary-foreground hover:bg-primary/85 active:scale-[0.98] transition-all rounded-xl shadow-sm hover:shadow-md"
                      >
                        Passer ma commande <ArrowRight className="w-4 h-4" />
                      </button>
                      <AnimatePresence mode="wait">
                        {!clearConfirm ? (
                          <motion.button
                            key="vider"
                            type="button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setClearConfirm(true)}
                            className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.15em] px-6 py-4 border-2 border-red-200 text-red-500 bg-transparent hover:bg-red-50 active:scale-[0.98] transition-all rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                            Vider le panier
                          </motion.button>
                        ) : (
                          <motion.div
                            key="vider-confirm"
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                          >
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            <span className="font-body text-sm text-red-700 flex-1">Vider tout le panier ?</span>
                            <button
                              type="button"
                              onClick={handleClearCart}
                              className="font-body text-xs uppercase tracking-wider px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                              Oui
                            </button>
                            <button
                              type="button"
                              onClick={() => setClearConfirm(false)}
                              className="font-body text-xs uppercase tracking-wider px-3 py-1.5 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                            >
                              Non
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.form>
                )}

                {/* ── Étape 2 : Paiement ── */}
                {checkoutStep === 'payment' && (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    className="px-6 py-7"
                  >
                    <p className="font-body text-sm text-muted-foreground mb-6">
                      Bonjour <span className="text-foreground font-medium">{fullName || nom}</span>, choisissez votre mode de paiement.
                    </p>
                    <div className="flex justify-center">
                      <PaymentMethods
                        amount={orderTotal}
                        orderId={pendingOrderId}
                        onSuccess={(mode) => finishOrder(mode ?? 'En ligne')}
                        onError={err => toast.error(err)}
                      />
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
