import { evaluatePromo, PromoError } from './promoCodes.js';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import Meal from '../models/Meal.model.js';
import Ingredient from '../models/Ingredient.model.js';
import Consultation from '../models/Consultation.model.js';
import Plan from '../models/Plan.model.js';
import Settings, { ZONES_DEFAULT } from '../models/Settings.model.js';

/**
 * Devis de commande : le serveur vérifie chaque ligne du panier contre le catalogue AVANT le paiement,
 * puis signe le résultat. Le paiement et la commande s'appuient sur ce devis, jamais sur les prix envoyés
 * par le navigateur. Vérifier en amont évite de refuser une commande déjà payée (prix modifié entre-temps).
 */

/** Erreur dont le message peut être montré tel quel au client. */
export class QuoteError extends Error {}

export interface QuoteLine {
  nom: string;
  qty: number;
  prix: number;
  customizations: string[];
}

export interface QuotePayload {
  orderId: string;
  items: QuoteLine[];
  sousTotal: number;
  fraisLivraison: number;
  /** Réduction d'un code promo, déjà déduite du total. Absente = pas de code. */
  remise?: number;
  codePromo?: string;
  total: number;
  modeCommande: 'livraison' | 'sur_place' | 'emporter';
  /** Absent = devis de commande. Un devis d'abonnement ne peut jamais servir à créer une commande, et inversement. */
  kind?: 'commande' | 'abonnement';
  abonnement?: { planId: string; planNom: string; billing: 'weekly' | 'monthly' };
}

export type LineRef =
  | { type: 'repas' | 'jus'; id: string }
  | { type: 'salade'; composition: { id: string; quantity: number }[] }
  | { type: 'consultation'; id: string; mode: 'virtuel' | 'presentiel' };

export interface RawLine {
  nom: string;
  qty: number;
  prix: number;
  customizations?: string[];
  ref?: LineRef;
}

const QUOTE_TTL = '3h';

// Clé dérivée : un devis, que n'importe quel visiteur peut obtenir, ne doit jamais être accepté
// comme jeton de connexion (admin ou client) signé avec JWT_SECRET.
function quoteSecret(): string {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET absent');
  return createHmac('sha256', base).update('devis-v1').digest('hex');
}

export function signQuote(payload: QuotePayload): string {
  return jwt.sign({ ...payload, typ: 'quote' }, quoteSecret(), { expiresIn: QUOTE_TTL });
}

export function verifyQuote(token: unknown): QuotePayload | null {
  if (typeof token !== 'string' || token.length < 20) return null;
  try {
    const { typ, iat: _iat, exp: _exp, ...payload } = jwt.verify(token, quoteSecret()) as QuotePayload & {
      typ?: string; iat?: number; exp?: number;
    };
    return typ === 'quote' ? payload : null;
  } catch {
    return null;
  }
}

const isObjectId = (id: unknown): id is string => typeof id === 'string' && Types.ObjectId.isValid(id) && id.length === 24;

/** Prix valides d'un produit : prix normal, prix promo, et prix de chaque format disponible. */
function allowedMealPrices(meal: { prix: number; prixPromo?: number | null; formats?: { prix: number; disponible?: boolean }[] }): number[] {
  const prices = [meal.prix];
  if (typeof meal.prixPromo === 'number' && meal.prixPromo > 0) prices.push(meal.prixPromo);
  for (const f of meal.formats ?? []) if (f.disponible !== false) prices.push(f.prix);
  return prices;
}

/** Valide les lignes du panier contre le catalogue et renvoie des lignes fiables. */
export async function priceLines(rawLines: RawLine[]): Promise<QuoteLine[]> {
  const mealIds = new Set<string>();
  const ingredientIds = new Set<string>();
  const consultationIds = new Set<string>();

  for (const line of rawLines) {
    const ref = line.ref;
    if (!ref) throw new QuoteError(`« ${line.nom} » ne peut pas être vérifié. Actualisez la page puis réessayez.`);
    if (ref.type === 'repas' || ref.type === 'jus') {
      if (!isObjectId(ref.id)) throw new QuoteError(`« ${line.nom} » n'est plus disponible. Retirez-le du panier.`);
      mealIds.add(ref.id);
    } else if (ref.type === 'salade') {
      if (!Array.isArray(ref.composition) || ref.composition.length === 0) {
        throw new QuoteError(`La composition de « ${line.nom} » est vide.`);
      }
      for (const c of ref.composition) {
        if (!isObjectId(c.id)) throw new QuoteError(`Un ingrédient de « ${line.nom} » n'est plus disponible.`);
        ingredientIds.add(c.id);
      }
    } else if (ref.type === 'consultation') {
      if (!isObjectId(ref.id)) throw new QuoteError(`La consultation « ${line.nom} » n'est plus disponible.`);
      consultationIds.add(ref.id);
    } else {
      throw new QuoteError(`« ${line.nom} » ne peut pas être vérifié.`);
    }
  }

  const [meals, ingredients, consultations] = await Promise.all([
    mealIds.size ? Meal.find({ _id: { $in: [...mealIds] }, disponible: true }).select('prix prixPromo formats').lean() : [],
    ingredientIds.size ? Ingredient.find({ _id: { $in: [...ingredientIds] }, actif: true }).select('prixVente').lean() : [],
    consultationIds.size ? Consultation.find({ _id: { $in: [...consultationIds] }, actif: true }).select('prix prixPresentiel').lean() : [],
  ]);
  const mealById = new Map(meals.map(m => [String(m._id), m]));
  const ingredientPrice = new Map(ingredients.map(i => [String(i._id), i.prixVente]));
  const consultationById = new Map(consultations.map(c => [String(c._id), c]));

  return rawLines.map(line => {
    const ref = line.ref as LineRef;
    let legit: number[];

    if (ref.type === 'repas' || ref.type === 'jus') {
      const meal = mealById.get(ref.id);
      if (!meal) throw new QuoteError(`« ${line.nom} » n'est plus disponible. Retirez-le du panier.`);
      legit = allowedMealPrices(meal);
    } else if (ref.type === 'salade') {
      let sum = 0;
      for (const c of ref.composition) {
        const unit = ingredientPrice.get(c.id);
        if (unit === undefined) throw new QuoteError(`Un ingrédient de « ${line.nom} » n'est plus disponible.`);
        if (!Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > 20) {
          throw new QuoteError(`Quantité invalide dans « ${line.nom} ».`);
        }
        sum += unit * c.quantity;
      }
      legit = [sum];
    } else if (ref.type === 'consultation') {
      const consultation = consultationById.get(ref.id);
      if (!consultation) throw new QuoteError(`La consultation « ${line.nom} » n'est plus disponible.`);
      legit = [ref.mode === 'presentiel' ? consultation.prixPresentiel : consultation.prix];
    } else {
      throw new QuoteError(`« ${line.nom} » ne peut pas être vérifié.`);
    }

    if (!legit.includes(line.prix)) {
      throw new QuoteError(`Le prix de « ${line.nom} » a changé. Actualisez la page pour le voir à jour.`);
    }
    return {
      nom: String(line.nom).trim().slice(0, 200),
      qty: line.qty,
      prix: line.prix,
      customizations: (line.customizations ?? []).map(c => String(c).trim().slice(0, 120)).slice(0, 20),
    };
  });
}

/**
 * Hors livraison, les frais sont nuls. En livraison, ils doivent être ceux d'une zone réelle : zéro n'est accepté
 * que si une zone est gratuite (le site n'applique pas de seuil de livraison offerte, le serveur non plus).
 */
export async function checkDeliveryFee(fee: number, modeCommande: QuotePayload['modeCommande']): Promise<void> {
  if (modeCommande !== 'livraison') {
    if (fee !== 0) throw new QuoteError('Des frais de livraison ne sont pas applicables à ce mode de commande.');
    return;
  }

  const settings = await Settings.findOne().select('zonesLivraison fraisLivraison').lean();
  const zones = settings?.zonesLivraison?.length ? settings.zonesLivraison : ZONES_DEFAULT;
  const allowed = new Set<number>(zones.map(z => z.frais));
  if (typeof settings?.fraisLivraison === 'number' && settings.fraisLivraison > 0) allowed.add(settings.fraisLivraison);
  if (!allowed.has(fee)) throw new QuoteError('Les frais de livraison ont changé. Actualisez la page puis réessayez.');
}

/** Devis d'abonnement : le prix vient du plan en base, jamais du navigateur. */
export async function buildSubscriptionQuote(input: {
  orderId: string;
  planId: string;
  billing: 'weekly' | 'monthly';
}): Promise<QuotePayload> {
  if (!isObjectId(input.planId)) throw new QuoteError("Cette formule n'est plus disponible.");
  const plan = await Plan.findOne({ _id: input.planId, actif: true }).select('nom prixHebdo prixMensuel').lean();
  if (!plan) throw new QuoteError("Cette formule n'est plus disponible.");

  const prix = input.billing === 'weekly' ? plan.prixHebdo : plan.prixMensuel;
  if (!Number.isFinite(prix) || !(prix > 0)) throw new QuoteError('Cette formule n’est pas proposée avec cette facturation.');

  const libelle = input.billing === 'weekly' ? 'Hebdomadaire' : 'Mensuel';
  return {
    kind: 'abonnement',
    abonnement: { planId: input.planId, planNom: plan.nom, billing: input.billing },
    orderId: input.orderId,
    items: [{ nom: `Abonnement ${plan.nom} — ${libelle}`, qty: 1, prix, customizations: [] }],
    sousTotal: prix,
    fraisLivraison: 0,
    total: prix,
    modeCommande: 'sur_place',
  };
}

export async function buildQuote(input: {
  orderId: string;
  items: RawLine[];
  fraisLivraison: number;
  modeCommande: QuotePayload['modeCommande'];
  /** Code promo saisi par le client : vérifié ici, jamais cru sur parole. */
  codePromo?: string;
}): Promise<QuotePayload> {
  const items = await priceLines(input.items);
  await checkDeliveryFee(input.fraisLivraison, input.modeCommande);
  // kind = 'commande' explicite : ce devis ne pourra pas servir à créer un abonnement.
  const sousTotal = items.reduce((s, i) => s + i.prix * i.qty, 0);

  // La réduction porte sur les articles (pas sur la livraison) et entre dans le total signé, donc dans le montant débité.
  let promo: Awaited<ReturnType<typeof evaluatePromo>> | null = null;
  if (input.codePromo && input.codePromo.trim()) {
    try {
      promo = await evaluatePromo(input.codePromo, sousTotal);
    } catch (error) {
      if (error instanceof PromoError) throw new QuoteError(error.message);
      throw error;
    }
  }
  return {
    kind: 'commande',
    orderId: input.orderId,
    items,
    sousTotal,
    fraisLivraison: input.fraisLivraison,
    ...(promo ? { remise: promo.remise, codePromo: promo.code } : {}),
    total: sousTotal - (promo?.remise ?? 0) + input.fraisLivraison,
    modeCommande: input.modeCommande,
  };
}
