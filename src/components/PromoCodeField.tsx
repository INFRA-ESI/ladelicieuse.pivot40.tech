import { Check, Loader2, X } from '@/components/icons';
import { formatPrice } from '@/data/products';
import type { PromoState } from '@/hooks/usePromoCode';

// Champ « Code promo » du panier : codes créés par l'équipe et codes obtenus en échange de points de fidélité.
export default function PromoCodeField({ promo }: { promo: PromoState }) {
  const { input, setInput, applied, error, busy, apply, remove } = promo;

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3" role="status">
        <span className="flex items-center gap-2 font-body text-sm text-primary min-w-0">
          <Check className="w-4 h-4 shrink-0" />
          <span className="truncate">Code {applied.code} appliqué : −{formatPrice(applied.remise)}</span>
        </span>
        <button type="button" onClick={remove} className="min-h-9 shrink-0 flex items-center gap-1 px-2 font-body text-xs text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" /> Retirer
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="cart-promo" className="font-body text-xs text-muted-foreground block mb-2">Code promo (facultatif)</label>
      <div className="flex gap-2">
        <input
          id="cart-promo"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void apply(); } }}
          placeholder="Ex : BIENVENUE10"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={!!error}
          aria-describedby={error ? 'cart-promo-error' : undefined}
          className={`min-w-0 flex-1 font-body text-sm px-4 py-3.5 border rounded-xl bg-background outline-none transition-colors ${error ? 'border-red-400 focus:border-red-500' : 'border-border focus:border-primary'}`}
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || !input.trim()}
          className="min-h-11 px-5 rounded-xl border border-primary text-primary font-body text-sm transition-colors hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Appliquer
        </button>
      </div>
      {error && <p id="cart-promo-error" role="alert" className="font-body text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
