// Nouvel essai de paiement contre une VRAIE base MongoDB : annulation, changement de moyen, double clic.
// Ignoré tant que MONGO_TEST_URI n'est pas défini (voir db.int.test.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const uri = process.env.MONGO_TEST_URI;
const { default: Transaction } = await import('../../models/Transaction.model.js');
const { singPayService } = await import('../../services/singpay.service.js');

let n = 0;
const tx = (over: Record<string, unknown> = {}) => Transaction.create({
  transactionId: `TXN-${++n}`, idempotencyKey: `k-${n}`, orderId: 'ORDER-1', provider: 'moov', status: 'pending', amount: 2500, ...over,
});
const ago = (ms: number) => new Date(Date.now() - ms);
// createdAt est géré par Mongoose : on le fixe après coup pour simuler l'âge de l'essai.
const aged = async (ms: number, over: Record<string, unknown> = {}) => {
  const t = await tx(over);
  await Transaction.collection.updateOne({ _id: t._id }, { $set: { createdAt: ago(ms) } });
  return t;
};

describe.skipIf(!uri)('intégration MongoDB — nouvel essai de paiement', () => {
  beforeAll(async () => { await mongoose.connect(uri as string, { dbName: `ld_pay_${Date.now()}` }); await Transaction.init(); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  beforeEach(async () => { await Transaction.deleteMany({}); });

  describe('ce qui bloque', () => {
    it('une commande déjà PAYÉE, quel que soit le moyen de paiement', async () => {
      await aged(60 * 60 * 1000, { status: 'success', provider: 'card' });
      for (const attempt of ['moov', 'airtel', 'card'] as const) {
        expect(await singPayService.checkDoublePayment('ORDER-1', attempt)).toMatchObject({ blocked: true, reason: 'Cette commande a déjà été payée.' });
      }
    });

    it('la même demande envoyée deux fois en quelques secondes (double clic)', async () => {
      await aged(5_000, { provider: 'moov' });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'moov')).toMatchObject({ blocked: true });
    });
  });

  describe('ce qui ne bloque plus', () => {
    it('réessayer avec le même moyen après quelques dizaines de secondes (annulation sur le téléphone)', async () => {
      await aged(45_000, { provider: 'moov' });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'moov')).toEqual({ blocked: false });
    });

    it('payer AUTREMENT juste après une annulation (Moov en cours, puis Airtel ou carte tout de suite)', async () => {
      await aged(3_000, { provider: 'moov' });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'airtel')).toEqual({ blocked: false });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'card')).toEqual({ blocked: false });
    });

    it.each(['failed', 'cancelled', 'timeout'])('un essai précédent « %s »', async (status) => {
      await aged(1_000, { status });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'moov')).toEqual({ blocked: false });
    });

    it('une autre commande n\'est jamais concernée', async () => {
      await aged(1_000, { orderId: 'ORDER-AUTRE', status: 'success' });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'moov')).toEqual({ blocked: false });
    });

    it('un essai « en cours » vieux de 6 minutes (l\'ancien blocage de 5 min n\'existe plus)', async () => {
      await aged(6 * 60 * 1000, { provider: 'card' });
      expect(await singPayService.checkDoublePayment('ORDER-1', 'card')).toEqual({ blocked: false });
    });
  });

  describe('remplacer les essais abandonnés', () => {
    it('passe en « cancelled » les essais en cours de la commande, sans toucher aux payés, échoués ni aux autres commandes', async () => {
      const pending = await tx({ status: 'pending' });
      const processing = await tx({ status: 'processing', provider: 'airtel' });
      const success = await tx({ status: 'success' });
      const failed = await tx({ status: 'failed' });
      const other = await tx({ orderId: 'ORDER-AUTRE', status: 'pending' });

      expect(await singPayService.supersedePending('ORDER-1')).toBe(2);
      const status = async (t: { _id: unknown }) => (await Transaction.findById(t._id))!.status;
      expect(await status(pending)).toBe('cancelled');
      expect(await status(processing)).toBe('cancelled');
      expect(await status(success)).toBe('success');
      expect(await status(failed)).toBe('failed');
      expect(await status(other)).toBe('pending');
      expect((await Transaction.findById(pending._id))!.errorMessage).toMatch(/Remplacé/);
    });

    it('rien à remplacer : 0, sans erreur', async () => {
      expect(await singPayService.supersedePending('ORDER-VIDE')).toBe(0);
    });
  });

  it('parcours complet : Moov en cours, annulation, Airtel accepté, puis Moov de nouveau accepté', async () => {
    await aged(2_000, { provider: 'moov' });
    expect((await singPayService.checkDoublePayment('ORDER-1', 'airtel')).blocked).toBe(false);
    await singPayService.supersedePending('ORDER-1');
    await aged(1_000, { provider: 'airtel' });
    expect((await singPayService.checkDoublePayment('ORDER-1', 'airtel')).blocked).toBe(true);    // double clic sur Airtel
    expect((await singPayService.checkDoublePayment('ORDER-1', 'moov')).blocked).toBe(false);     // retour à Moov
  });
});
