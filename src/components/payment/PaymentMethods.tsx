import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, ChevronRight, Phone, CreditCard, Smartphone, Banknote, ExternalLink } from 'lucide-react';
import { formatFCFA, normalizeGabonPhoneNumber, validateGabonPhoneNumber } from '../../lib/utils';

// ── Options paiement ──────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  {
    value: 'card',
    label: 'Carte bancaire',
    sub:   'Visa · Mastercard · PayPal via SingPay',
    icon:  CreditCard,
  },
  {
    value: 'airtel',
    label: 'Airtel Money',
    sub:   'Mobile Money · Gabon via SingPay',
    icon:  Smartphone,
  },
  {
    value: 'moov',
    label: 'Moov Money',
    sub:   'Mobile Money · Gabon via SingPay',
    icon:  Smartphone,
  },
  {
    value: 'cash',
    label: 'Paiement en espèces',
    sub:   'À régler sur place au moment du retrait',
    icon:  Banknote,
  },
] as const;

type PaymentValue = typeof PAYMENT_OPTIONS[number]['value'];

const POLL_INTERVAL_MS = 5000;
const POLL_MAX         = 72;

// ── Props ─────────────────────────────────────────────────────────────────────

interface PaymentMethodsProps {
  amount:     number;
  orderId?:   string;
  onSuccess?: (mode?: string) => void;
  onError?:   (error: string) => void;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function callSingPay(body: Record<string, unknown>) {
  const resp = await fetch('/api/payments/singpay/init', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 409) throw new Error(json.error ?? 'Paiement déjà en cours pour cette commande.');
  if (!resp.ok || !json.success) throw new Error(json.error ?? json.message ?? 'Erreur paiement.');
  return json.data as { transactionId?: string; paymentUrl?: string; message?: string };
}

async function pollStatus(transactionId: string) {
  const resp = await fetch(`/api/payments/singpay/check/${transactionId}`);
  const json = await resp.json().catch(() => ({}));
  return json.data as { status: string; isComplete: boolean; message?: string } | undefined;
}

// ── Composant principal ───────────────────────────────────────────────────────

export const PaymentMethods: React.FC<PaymentMethodsProps> = ({
  amount,
  orderId = `ORDER-${Date.now()}`,
  onSuccess,
  onError,
}) => {
  const [method, setMethod]   = useState<PaymentValue | ''>('');
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  const [awaitingPin, setAwaitingPin] = useState(false);
  const [pollSeconds, setPollSeconds] = useState(0);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const txnIdRef = useRef('');

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPolling(), []);

  const resetForm = (m: PaymentValue | '') => {
    stopPolling();
    setMethod(m);
    setPhone('');
    setError(''); setAwaitingPin(false); setPollSeconds(0);
    txnIdRef.current = '';
  };

  const startPolling = (transactionId: string) => {
    txnIdRef.current = transactionId;
    setAwaitingPin(true);
    setLoading(false);
    let count = 0, elapsed = 0;
    pollRef.current = setInterval(async () => {
      count++;
      elapsed += POLL_INTERVAL_MS / 1000;
      setPollSeconds(elapsed);
      try {
        const data = await pollStatus(transactionId);
        if (!data) return;
        if (data.isComplete) {
          stopPolling(); setAwaitingPin(false);
          if (data.status === 'success') {
            const modeName = method === 'airtel' ? 'Airtel Money' : method === 'moov' ? 'Moov Money' : 'Carte bancaire';
            setDoneMsg('Paiement confirmé !'); setDone(true); onSuccess?.(modeName);
          } else {
            const msg = data.message || `Paiement ${data.status}. Réessayez.`;
            setError(msg); onError?.(msg);
          }
        }
      } catch { /* erreur réseau */ }
      if (count >= POLL_MAX) {
        stopPolling(); setAwaitingPin(false);
        const msg = 'Délai dépassé (6 min). Si le montant a été débité, contactez-nous.';
        setError(msg); onError?.(msg);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleMobilePay = async (provider: 'airtel' | 'moov') => {
    if (!phone.trim())                    { setError('Entrez votre numéro.'); return; }
    if (!validateGabonPhoneNumber(phone)) { setError('Numéro invalide. Format : 07XXXXXXXX'); return; }
    setLoading(true); setError('');
    try {
      const data = await callSingPay({
        amount, orderId, method: 'mobile_money', provider,
        phone: normalizeGabonPhoneNumber(phone),
        description: `Commande La Délicieuse Diète #${orderId}`,
      });
      if (data?.transactionId) {
        startPolling(data.transactionId);
      } else {
        // SingPay n'a pas retourné de transactionId — impossible de confirmer par polling.
        // On informe l'utilisateur mais on n'appelle PAS onSuccess (le paiement n'est pas confirmé).
        setError(data?.message ?? 'Demande envoyée. Vérifiez votre téléphone et réessayez si le paiement échoue.');
        setLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur paiement.';
      setError(msg); onError?.(msg); setLoading(false);
    }
  };

  const handleCard = async () => {
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/payments/singpay/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          orderId,
          successUrl: `${window.location.origin}/paiement/succes?order=${orderId}&provider=card`,
          cancelUrl:  `${window.location.origin}/paiement/echec?order=${orderId}&provider=card`,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success) throw new Error(json.error ?? 'Erreur paiement carte.');
      const { link, reference } = json.data as { link: string; exp: string; reference: string };
      if (reference) sessionStorage.setItem('singpay_txn', reference);
      sessionStorage.setItem('singpay_order', orderId);
      window.location.href = link;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur paiement.';
      setError(msg); onError?.(msg); setLoading(false);
    }
  };

  const handleCash = () => {
    setDoneMsg('Commande confirmée ! Payez en espèces au moment du retrait.');
    setDone(true);
    onSuccess?.('Espèces sur place');
  };

  // ── Succès ────────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4 py-10 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="font-body text-base font-semibold text-foreground">{doneMsg}</p>
          <p className="font-body text-sm text-muted-foreground mt-1">
            {formatFCFA(amount)} · #{orderId.slice(-8).toUpperCase()}
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Attente PIN Mobile Money ───────────────────────────────────────────────────

  if (awaitingPin) {
    const minutes = Math.floor(pollSeconds / 60);
    const seconds = Math.floor(pollSeconds % 60);
    const elapsed = minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-5 py-10 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Phone className="w-7 h-7 text-primary animate-pulse" />
        </div>
        <div>
          <p className="font-body text-base font-semibold text-foreground">Confirmez sur votre téléphone</p>
          <p className="font-body text-sm text-muted-foreground mt-1 max-w-xs">
            Une notification USSD a été envoyée. Entrez votre PIN pour valider.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          <span className="font-body text-xs text-muted-foreground">En attente… {elapsed}</span>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {formatFCFA(amount)} · <span className="text-foreground font-medium">#{orderId.slice(-8).toUpperCase()}</span>
        </p>
        <button
          type="button"
          onClick={() => { stopPolling(); setAwaitingPin(false); setError('Paiement annulé.'); }}
          className="font-body text-xs text-muted-foreground hover:text-red-500 transition-colors underline"
        >
          Annuler
        </button>
      </motion.div>
    );
  }

  // ── Liste des moyens de paiement ──────────────────────────────────────────────

  return (
    <div className="w-full flex flex-col gap-2.5">
      <p className="font-body text-xs uppercase tracking-wider text-muted-foreground mb-0.5">
        Moyen de paiement
      </p>

      {PAYMENT_OPTIONS.map((opt) => {
        const Icon     = opt.icon;
        const selected = method === opt.value;

        return (
          <div
            key={opt.value}
            className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
              selected
                ? 'border-primary ring-2 ring-primary ring-offset-1 bg-white'
                : 'border-border bg-background hover:border-primary/50 cursor-pointer'
            }`}
          >
            {/* En-tête */}
            <button
              type="button"
              onClick={() => resetForm(selected ? '' : opt.value as PaymentValue)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                selected ? 'bg-primary' : 'bg-primary/10'
              }`}>
                <Icon className={`w-5 h-5 ${selected ? 'text-white' : 'text-primary'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`font-body text-sm font-semibold leading-tight transition-colors ${
                  selected ? 'text-primary' : 'text-foreground'
                }`}>
                  {opt.label}
                </p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                selected ? 'border-primary bg-primary' : 'border-border bg-transparent'
              }`}>
                {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </div>
            </button>

            {/* Formulaire expandable */}
            <AnimatePresence initial={false}>
              {selected && (
                <motion.div
                  key="form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border/40">

                    {/* Carte bancaire / PayPal */}
                    {opt.value === 'card' && (
                      <div className="flex flex-col gap-3 pt-2">
                        <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                          <p className="font-body text-sm text-foreground">
                            Vous serez redirigé vers la page de paiement sécurisée SingPay pour régler{' '}
                            <span className="font-semibold text-primary">{formatFCFA(amount)}</span>{' '}
                            par Visa, Mastercard ou PayPal.
                          </p>
                        </div>
                        {error && <p className="font-body text-sm text-red-500">{error}</p>}
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleCard}
                          className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.12em] px-6 py-3.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</>
                            : <><ExternalLink className="w-4 h-4" /> Payer {formatFCFA(amount)} en sécurité</>
                          }
                        </button>
                        <p className="font-body text-xs text-center text-muted-foreground">
                          Paiement sécurisé SSL · Visa · Mastercard · PayPal
                        </p>
                      </div>
                    )}

                    {/* Airtel Money */}
                    {opt.value === 'airtel' && (
                      <MobileForm
                        amount={amount} phone={phone}
                        setPhone={v => { setPhone(v); setError(''); }}
                        loading={loading} error={error}
                        onPay={() => handleMobilePay('airtel')}
                        hint="Une notification USSD sera envoyée sur votre téléphone Airtel"
                      />
                    )}

                    {/* Moov Money */}
                    {opt.value === 'moov' && (
                      <MobileForm
                        amount={amount} phone={phone}
                        setPhone={v => { setPhone(v); setError(''); }}
                        loading={loading} error={error}
                        onPay={() => handleMobilePay('moov')}
                        hint="Une notification USSD sera envoyée sur votre téléphone Moov"
                      />
                    )}

                    {/* Espèces sur place */}
                    {opt.value === 'cash' && (
                      <div className="flex flex-col gap-3 pt-2">
                        <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
                          <p className="font-body text-sm text-foreground">
                            Votre commande sera préparée et vous devrez régler{' '}
                            <span className="font-semibold text-primary">{formatFCFA(amount)}</span>{' '}
                            en espèces au moment du retrait sur place.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCash}
                          className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.12em] px-6 py-3.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
                        >
                          Confirmer la commande <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

// ── Composants réutilisables ──────────────────────────────────────────────────

function Field({
  label, type, value, onChange, placeholder, disabled,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="font-body text-xs uppercase tracking-wider text-muted-foreground block mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full font-body text-sm px-4 py-3 rounded-xl border border-border bg-background outline-none focus:border-primary transition-colors disabled:opacity-50"
      />
    </div>
  );
}

function PayButton({
  loading, disabled, amount, onClick, label,
}: {
  loading: boolean; disabled: boolean; amount: number; onClick: () => void; label?: string;
}) {
  return (
    <button
      type="button"
      disabled={loading || disabled}
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 font-body text-sm uppercase tracking-[0.12em] px-6 py-3.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading
        ? <><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</>
        : <>{label ?? 'Payer'} {formatFCFA(amount)} <ChevronRight className="w-4 h-4" /></>
      }
    </button>
  );
}

function MobileForm({
  amount, phone, setPhone, loading, error, onPay, hint,
  disabled = false, placeholder = 'Ex : 074 12 34 56',
}: {
  amount: number; phone: string; setPhone: (v: string) => void;
  loading: boolean; error: string; onPay: () => void;
  hint?: string; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Field
        label="Numéro de téléphone"
        type="tel"
        value={phone}
        onChange={v => setPhone(v.replace(/[^\d\s+-]/g, ''))}
        placeholder={placeholder}
        disabled={loading || disabled}
      />
      {error && <p className="font-body text-sm text-red-500">{error}</p>}
      <PayButton loading={loading} disabled={disabled || !phone.trim()} amount={amount} onClick={onPay} />
      {hint && !loading && (
        <p className="font-body text-xs text-center text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
