import { useCallback, useEffect, useRef, useState } from 'react';

// Code promo du panier. Le montant affiché ici est INDICATIF : le serveur revérifie le code au moment du devis et inscrit la
// réduction dans le devis signé, donc dans le montant réellement débité. On revérifie quand le panier change (une quantité
// modifiée peut faire passer sous le minimum du code) avec un délai, pour ne pas interroger le serveur à chaque clic.

export interface AppliedPromo { code: string; remise: number }

export interface PromoState {
  input: string;
  setInput: (value: string) => void;
  applied: AppliedPromo | null;
  error: string;
  busy: boolean;
  apply: () => Promise<void>;
  remove: () => void;
}

const REVALIDATE_DELAY_MS = 400;

async function validate(code: string, montant: number, signal?: AbortSignal): Promise<{ promo: AppliedPromo | null; message: string; network?: boolean }> {
  try {
    const res = await fetch('/api/promotions/codes/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, montant }),
      signal,
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return { promo: { code: json.data.code, remise: json.data.remise ?? json.data.reduction }, message: '' };
    if (res.status === 429) return { promo: null, message: 'Trop d\'essais. Patientez quelques minutes avant de réessayer.' };
    return { promo: null, message: json?.message ?? 'Ce code n\'a pas pu être vérifié.' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { promo: null, message: 'Connexion impossible. Réessayez.', network: true };
  }
}

export function usePromoCode(subtotal: number): PromoState {
  const [input, setInput] = useState('');
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const appliedCode = applied?.code;

  const apply = useCallback(async () => {
    const code = input.trim();
    if (!code) { setError('Saisissez votre code.'); return; }
    setBusy(true);
    setError('');
    const result = await validate(code, subtotal);
    setBusy(false);
    if (result.promo) { setApplied(result.promo); setInput(''); } else setError(result.message);
  }, [input, subtotal]);

  const remove = useCallback(() => { setApplied(null); setError(''); setInput(''); }, []);

  // Le panier change : on revérifie le code appliqué (annulé avec un message s'il ne tient plus).
  const latest = useRef(subtotal);
  useEffect(() => {
    if (!appliedCode || latest.current === subtotal) { latest.current = subtotal; return; }
    latest.current = subtotal;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await validate(appliedCode, subtotal, controller.signal);
        if (result.promo) setApplied(result.promo);
        else if (!result.network) {   // une coupure réseau ne retire pas un code valide
          setApplied(null);
          setError(`Le code ${appliedCode} a été retiré : ${result.message.charAt(0).toLowerCase()}${result.message.slice(1)}.`);
        }
      } catch { /* requête annulée par un nouveau changement de panier */ }
    }, REVALIDATE_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [subtotal, appliedCode]);

  return { input, setInput, applied, error, busy, apply, remove };
}
