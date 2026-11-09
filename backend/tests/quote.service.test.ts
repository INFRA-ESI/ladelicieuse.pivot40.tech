import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'q'.repeat(48);

const id = (c: string) => c.repeat(24);
const MEAL_JUS = id('a');       // jus avec formats et promo
const MEAL_REPAS = id('b');     // repas simple
const MEAL_ABSENT = id('c');    // introuvable en base
const ING_LAITUE = id('d');     // 300
const ING_POULET = id('e');     // 1200
const CONSULT = id('f');        // 15 000 en ligne, 25 000 en présentiel

const catalogue = {
  meals: [
    { _id: MEAL_JUS, prix: 2000, prixPromo: 1800, formats: [{ label: '1L', prix: 3500, disponible: true }, { label: '2L', prix: 6000, disponible: false }] },
    { _id: MEAL_REPAS, prix: 2500, prixPromo: null, formats: [] },
  ],
  ingredients: [{ _id: ING_LAITUE, prixVente: 300 }, { _id: ING_POULET, prixVente: 1200 }],
  consultations: [{ _id: CONSULT, prix: 15000, prixPresentiel: 25000 }],
};
let settings: { zonesLivraison?: { frais: number }[]; fraisLivraison?: number } | null = { zonesLivraison: [{ frais: 2000 }, { frais: 3000 }], fraisLivraison: 2000 };

const byIds = <T extends { _id: string }>(rows: T[]) => (q: { _id: { $in: string[] } }) => ({
  select: () => ({ lean: async () => rows.filter(r => q._id.$in.includes(r._id)) }),
});
vi.mock('../models/Meal.model.js', () => ({ default: { find: (q: never) => byIds(catalogue.meals)(q) } }));
vi.mock('../models/Ingredient.model.js', () => ({ default: { find: (q: never) => byIds(catalogue.ingredients)(q) } }));
vi.mock('../models/Consultation.model.js', () => ({ default: { find: (q: never) => byIds(catalogue.consultations)(q) } }));
const plans = [
  { _id: id('1'), nom: 'Vitalité', actif: true, prixHebdo: 14100, prixMensuel: 45000 },
  { _id: id('2'), nom: 'Sans hebdo', actif: true, prixMensuel: 30000 },
  { _id: id('3'), nom: 'Retiré', actif: false, prixHebdo: 5000, prixMensuel: 20000 },
];
vi.mock('../models/Plan.model.js', () => ({
  default: {
    findOne: (q: { _id: string; actif: boolean }) => ({
      select: () => ({ lean: async () => plans.find(p => p._id === q._id && p.actif === q.actif) ?? null }),
    }),
  },
}));
vi.mock('../models/Settings.model.js', () => ({
  default: { findOne: () => ({ select: () => ({ lean: async () => settings }) }) },
  ZONES_DEFAULT: [{ frais: 2000 }, { frais: 3000 }],
}));

const { buildQuote, buildSubscriptionQuote, priceLines, signQuote, verifyQuote, QuoteError } = await import('../services/quote.service.js');

const jus = (prix: number, extra: object = {}) => ({ nom: 'Jus', qty: 1, prix, ref: { type: 'jus' as const, id: MEAL_JUS }, ...extra });

beforeEach(() => { settings = { zonesLivraison: [{ frais: 2000 }, { frais: 3000 }], fraisLivraison: 2000 }; });

describe('priceLines — repas et jus', () => {
  it('accepte le prix normal, le prix promo et un format disponible', async () => {
    for (const prix of [2000, 1800, 3500]) {
      await expect(priceLines([jus(prix)])).resolves.toHaveLength(1);
    }
  });

  it('refuse un prix à 0 ou inventé (la faille : commander gratuitement)', async () => {
    await expect(priceLines([jus(0)])).rejects.toBeInstanceOf(QuoteError);
    await expect(priceLines([jus(1)])).rejects.toBeInstanceOf(QuoteError);
    await expect(priceLines([jus(1999)])).rejects.toBeInstanceOf(QuoteError);
  });

  it('refuse le prix d’un format indisponible', async () => {
    await expect(priceLines([jus(6000)])).rejects.toBeInstanceOf(QuoteError);
  });

  it('refuse un produit absent du catalogue ou à identifiant invalide', async () => {
    await expect(priceLines([{ nom: 'Fantôme', qty: 1, prix: 1000, ref: { type: 'repas', id: MEAL_ABSENT } }])).rejects.toBeInstanceOf(QuoteError);
    await expect(priceLines([{ nom: 'Statique', qty: 1, prix: 1000, ref: { type: 'repas', id: 'poulet-roti' } }])).rejects.toBeInstanceOf(QuoteError);
  });

  it('refuse une ligne sans référence : impossible de la vérifier', async () => {
    await expect(priceLines([{ nom: 'Sans réf', qty: 1, prix: 0 }])).rejects.toBeInstanceOf(QuoteError);
  });
});

describe('priceLines — salades composées', () => {
  const salade = (prix: number, composition: { id: string; quantity: number }[]) =>
    ({ nom: 'Ma salade', qty: 1, prix, ref: { type: 'salade' as const, composition } });

  it('accepte la somme exacte des ingrédients × quantités', async () => {
    await expect(priceLines([salade(300 * 2 + 1200, [{ id: ING_LAITUE, quantity: 2 }, { id: ING_POULET, quantity: 1 }])])).resolves.toHaveLength(1);
  });

  it('refuse une salade facturée moins que ses ingrédients', async () => {
    await expect(priceLines([salade(500, [{ id: ING_LAITUE, quantity: 2 }, { id: ING_POULET, quantity: 1 }])])).rejects.toBeInstanceOf(QuoteError);
  });

  it('refuse un ingrédient inconnu, une quantité invalide ou une composition vide', async () => {
    await expect(priceLines([salade(0, [{ id: id('9'), quantity: 1 }])])).rejects.toBeInstanceOf(QuoteError);
    await expect(priceLines([salade(300, [{ id: ING_LAITUE, quantity: 0 }])])).rejects.toBeInstanceOf(QuoteError);
    await expect(priceLines([salade(0, [])])).rejects.toBeInstanceOf(QuoteError);
  });
});

describe('priceLines — consultations', () => {
  const consult = (prix: number, mode: 'virtuel' | 'presentiel') =>
    ({ nom: 'Consultation', qty: 1, prix, ref: { type: 'consultation' as const, id: CONSULT, mode } });

  it('applique le tarif du mode choisi', async () => {
    await expect(priceLines([consult(15000, 'virtuel')])).resolves.toHaveLength(1);
    await expect(priceLines([consult(25000, 'presentiel')])).resolves.toHaveLength(1);
  });

  it('refuse le tarif en ligne pour du présentiel', async () => {
    await expect(priceLines([consult(15000, 'presentiel')])).rejects.toBeInstanceOf(QuoteError);
  });
});

describe('buildQuote — total et frais de livraison', () => {
  it('calcule le total côté serveur : lignes × quantités + frais', async () => {
    const q = await buildQuote({ orderId: 'ORDER-1', items: [jus(2000, { qty: 3 })], fraisLivraison: 2000, modeCommande: 'livraison' });
    expect(q).toMatchObject({ sousTotal: 6000, fraisLivraison: 2000, total: 8000 });
  });

  it('refuse des frais qui ne correspondent à aucune zone', async () => {
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 1, modeCommande: 'livraison' })).rejects.toBeInstanceOf(QuoteError);
  });

  it('refuse des frais hors livraison, accepte zéro', async () => {
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 2000, modeCommande: 'sur_place' })).rejects.toBeInstanceOf(QuoteError);
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 0, modeCommande: 'sur_place' })).resolves.toBeDefined();
  });

  it('refuse zéro en livraison : une livraison offerte ne se choisit pas', async () => {
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 0, modeCommande: 'livraison' })).rejects.toBeInstanceOf(QuoteError);
  });

  it('accepte zéro en livraison seulement si une zone est réellement gratuite', async () => {
    settings = { zonesLivraison: [{ frais: 0 }, { frais: 3000 }] };
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 0, modeCommande: 'livraison' })).resolves.toBeDefined();
  });

  it('marque le devis comme devis de commande', async () => {
    const q = await buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 2000, modeCommande: 'livraison' });
    expect(q.kind).toBe('commande');
  });

  it('se rabat sur les zones par défaut quand aucun réglage n’est enregistré', async () => {
    settings = null;
    await expect(buildQuote({ orderId: 'O', items: [jus(2000)], fraisLivraison: 3000, modeCommande: 'livraison' })).resolves.toBeDefined();
  });
});

describe('buildSubscriptionQuote — le prix vient du plan en base', () => {
  const sub = (planId: string, billing: 'weekly' | 'monthly') => buildSubscriptionQuote({ orderId: 'SUB-1', planId, billing });

  it('prend le prix mensuel ou hebdomadaire du plan', async () => {
    expect(await sub(id('1'), 'monthly')).toMatchObject({ kind: 'abonnement', total: 45000, abonnement: { planNom: 'Vitalité', billing: 'monthly' } });
    expect(await sub(id('1'), 'weekly')).toMatchObject({ total: 14100 });
  });

  it('refuse un plan inconnu, retiré, ou à identifiant invalide', async () => {
    await expect(sub(id('9'), 'monthly')).rejects.toBeInstanceOf(QuoteError);
    await expect(sub(id('3'), 'monthly')).rejects.toBeInstanceOf(QuoteError);
    await expect(sub('essentiel', 'monthly')).rejects.toBeInstanceOf(QuoteError);
  });

  it("refuse une facturation que le plan ne propose pas (pas de prix hebdomadaire)", async () => {
    await expect(sub(id('2'), 'weekly')).rejects.toBeInstanceOf(QuoteError);
    await expect(sub(id('2'), 'monthly')).resolves.toBeDefined();
  });
});

describe('devis signé', () => {
  const payload = { orderId: 'ORDER-9', items: [], sousTotal: 100, fraisLivraison: 0, total: 100, modeCommande: 'sur_place' as const };

  it('se vérifie et restitue son contenu', () => {
    expect(verifyQuote(signQuote(payload))).toMatchObject({ orderId: 'ORDER-9', total: 100 });
  });

  it('refuse un devis modifié (total changé à la main)', () => {
    const token = signQuote(payload);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, total: 1, typ: 'quote' })).toString('base64url');
    expect(verifyQuote(`${h}.${forged}.${s}`)).toBeNull();
  });

  it('refuse un jeton signé avec le secret de connexion (admin ou client)', () => {
    const loginToken = jwt.sign({ ...payload, typ: 'quote' }, process.env.JWT_SECRET as string);
    expect(verifyQuote(loginToken)).toBeNull();
  });

  it("n'accepte pas un devis comme jeton de connexion", () => {
    const quote = signQuote(payload);
    expect(() => jwt.verify(quote, process.env.JWT_SECRET as string)).toThrow();
  });

  it('refuse les valeurs absentes ou invalides', () => {
    expect(verifyQuote(undefined)).toBeNull();
    expect(verifyQuote('')).toBeNull();
    expect(verifyQuote('pas.un.jeton-valide-du-tout')).toBeNull();
  });
});
