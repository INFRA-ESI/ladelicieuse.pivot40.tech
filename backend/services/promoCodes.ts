import PromoCode from '../models/PromoCode.model.js';

// Codes promo : un code se vérifie CÔTÉ SERVEUR, au moment du devis. La réduction est inscrite dans le devis signé, donc dans
// le montant réellement débité : le navigateur ne peut ni inventer une réduction, ni en modifier le montant.

// Une commande payée ne descend jamais sous ce montant (le paiement mobile refuse 0 FCFA et un panier « gratuit » est suspect).
export const MIN_PAYABLE = 100;

export class PromoError extends Error {
  constructor(message: string, public readonly status: 400 | 404 = 400) {
    super(message);
  }
}

export interface PromoApplied {
  code: string;
  type: 'pourcentage' | 'fixe';
  /** Réduction en FCFA, déjà plafonnée. */
  remise: number;
  minCommande: number;
}

const CODE_FORMAT = /^[A-Z0-9_-]{3,40}$/;

// « fidelite-abc-12 » → « FIDELITE-ABC-12 » ; refuse tout ce qui n'est pas du texte simple (objets de requête, caractères spéciaux).
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_FORMAT.test(code) ? code : null;
}

interface PromoRule { reduction: number; typeReduction: 'pourcentage' | 'fixe' }

export function computeRemise(promo: PromoRule, subtotal: number): number {
  const raw = promo.typeReduction === 'pourcentage'
    ? Math.floor((subtotal * Math.min(100, promo.reduction)) / 100)
    : Math.floor(promo.reduction);
  return Math.max(0, Math.min(raw, subtotal - MIN_PAYABLE));
}

export async function evaluatePromo(rawCode: unknown, subtotal: number, now: Date = new Date()): Promise<PromoApplied> {
  const code = normalizeCode(rawCode);
  if (!code) throw new PromoError('Code promo invalide', 404);
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new PromoError('Montant invalide');

  const promo = await PromoCode.findOne({ code, active: true }).lean();
  if (!promo) throw new PromoError('Code promo invalide', 404);
  if (promo.expiry && new Date(promo.expiry) < now) throw new PromoError('Code promo expiré');
  if (promo.maxUtilisations && promo.utilisations >= promo.maxUtilisations) throw new PromoError('Code promo épuisé');
  if (promo.minCommande && subtotal < promo.minCommande) {
    throw new PromoError(`Ce code demande une commande d'au moins ${promo.minCommande.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`);
  }

  const remise = computeRemise(promo, subtotal);
  if (remise <= 0) throw new PromoError('Ce code ne s\'applique pas à ce panier');
  return { code: promo.code, type: promo.typeReduction, remise, minCommande: promo.minCommande ?? 0 };
}

// Compte l'utilisation à la création de la commande. L'incrément ne passe que si le plafond n'est pas atteint : deux commandes
// simultanées avec un code à usage unique ne peuvent pas toutes deux l'utiliser. Retourne false si le plafond est déjà atteint
// (la commande a été devisée avant : on l'honore, le dépassement est seulement journalisé par l'appelant).
export async function consumePromo(code: string): Promise<boolean> {
  const updated = await PromoCode.findOneAndUpdate(
    { code, active: true, $expr: { $lt: ['$utilisations', '$maxUtilisations'] } },
    { $inc: { utilisations: 1 } },
  );
  return updated !== null;
}

// Création / modification d'un code par l'équipe : refuse les valeurs qui donneraient une réduction absurde.
export interface PromoInput { code?: unknown; reduction?: unknown; typeReduction?: unknown; minCommande?: unknown; maxUtilisations?: unknown; expiry?: unknown }

export function validatePromoInput(input: PromoInput, partial = false): string | null {
  const { code, reduction, typeReduction, minCommande, maxUtilisations, expiry } = input;
  if (code !== undefined && normalizeCode(code) === null) return 'Code invalide : 3 à 40 caractères (lettres, chiffres, tiret).';
  if (!partial && code === undefined) return 'Le code est requis.';
  if (typeReduction !== undefined && typeReduction !== 'pourcentage' && typeReduction !== 'fixe') return 'Type de réduction invalide.';
  if (reduction !== undefined || !partial) {
    if (typeof reduction !== 'number' || !Number.isFinite(reduction) || reduction <= 0) return 'La réduction doit être supérieure à 0.';
    if ((typeReduction ?? 'pourcentage') === 'pourcentage' && reduction > 100) return 'Un pourcentage ne peut pas dépasser 100.';
  }
  if (minCommande !== undefined && (typeof minCommande !== 'number' || !Number.isFinite(minCommande) || minCommande < 0)) return 'Commande minimum invalide.';
  if (maxUtilisations !== undefined && (typeof maxUtilisations !== 'number' || !Number.isInteger(maxUtilisations) || maxUtilisations < 1)) return 'Nombre d\'utilisations invalide.';
  if (expiry !== undefined && expiry !== null && expiry !== '' && Number.isNaN(new Date(String(expiry)).getTime())) return 'Date d\'expiration invalide.';
  return null;
}
