import { beforeEach, describe, expect, it, vi } from 'vitest';

// Le service SingPay crée son client HTTP à l'import : on le remplace pour simuler les réponses de la passerelle.
const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
const axiosError = vi.hoisted(() => (status: number | undefined, message: string, code?: string) =>
  Object.assign(new Error(message), { isAxiosError: true, code, response: status === undefined ? undefined : { status, data: { message } } }));

vi.mock('axios', () => ({
  default: {
    create: () => ({ post: http.post, get: http.get, interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } }),
    isAxiosError: (e: unknown) => (e as { isAxiosError?: boolean })?.isAxiosError === true,
  },
}));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../models/Transaction.model.js', () => ({ default: {} }));
vi.mock('../models/Order.model.js', () => ({ default: {} }));

const { PaymentError, classifyProviderFailure, fromHttpFailure } = await import('../services/paymentErrors.js');
const { singPayService } = await import('../services/singpay.service.js');

const init = (provider: 'moov' | 'airtel' = 'moov') =>
  singPayService.initiateMobileMoneyPayment({ amount: 2500, provider, phone: '+24166123456', orderId: 'ORDER-1' } as never);

beforeEach(() => { vi.clearAllMocks(); });

describe('Moov / Airtel — panne de passerelle', () => {
  it('« Moov gateway error: 502 Bad Gateway » dans une réponse HTTP 200 : panne, message clair, rien de technique', async () => {
    http.post.mockResolvedValue({ data: { status: { success: false, message: 'Moov gateway error: 502 Bad Gateway', result_code: 502 } } });
    const error = await init('moov').catch(e => e);
    expect(error).toBeInstanceOf(PaymentError);
    expect(error.kind).toBe('unavailable');
    expect(error.httpStatus).toBe(503);
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.message).toMatch(/Moov Money est momentanément indisponible/);
    expect(error.message).toMatch(/autre moyen de paiement/);
    expect(error.message).not.toMatch(/gateway|502|SingPay/i);
    expect(error.detail).toMatch(/502 Bad Gateway/);   // le détail reste disponible pour les journaux
  });

  it('même panne côté Airtel : le message cite Airtel Money', async () => {
    http.post.mockResolvedValue({ data: { status: { success: false, message: 'Airtel gateway error: 504 Gateway Timeout', result_code: 504 } } });
    const error = await init('airtel').catch(e => e);
    expect(error.message).toMatch(/Airtel Money est momentanément indisponible/);
  });

  it.each([502, 503, 504, 500])('erreur HTTP %i de SingPay : panne, pas d\'erreur « de saisie »', async (status) => {
    http.post.mockRejectedValue(axiosError(status, 'Bad Gateway'));
    const error = await init().catch(e => e);
    expect(error.kind).toBe('unavailable');
    expect(error.message).not.toMatch(/Bad Gateway|HTTP|SingPay/i);
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'])('coupure réseau (%s) : panne', async (code) => {
    http.post.mockRejectedValue(axiosError(undefined, 'timeout of 30000ms exceeded', code));
    expect((await init().catch(e => e)).kind).toBe('unavailable');
  });

  it('429 (trop de demandes) : réessayer plus tard', async () => {
    http.post.mockRejectedValue(axiosError(429, 'Too Many Requests'));
    expect((await init().catch(e => e)).kind).toBe('unavailable');
  });
});

describe('refus de l\'opérateur et problèmes de configuration', () => {
  it('solde insuffisant : c\'est un refus, le message de l\'opérateur est conservé tel quel', async () => {
    http.post.mockResolvedValue({ data: { status: { success: false, message: 'Solde insuffisant', result_code: 4001 } } });
    const error = await init().catch(e => e);
    expect(error.kind).toBe('rejected');
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('PAYMENT_REJECTED');
    expect(error.message).toBe('Solde insuffisant');
  });

  it('refus sans message : texte par défaut', () => {
    expect(classifyProviderFailure('', 4002).message).toMatch(/refusé/);
  });

  it.each([401, 402, 403, 404])('HTTP %i (identifiants, solde de la boutique, endpoint) : jamais de détail de configuration pour le client', async (status) => {
    http.post.mockRejectedValue(axiosError(status, 'Vérifiez SINGPAY_API_KEY'));
    const error = await init().catch(e => e);
    expect(error.kind).toBe('config');
    expect(error.httpStatus).toBe(503);
    expect(error.message).not.toMatch(/SINGPAY|API_KEY|endpoint|portefeuille/i);
    expect(error.detail).toMatch(String(status));
  });

  it('400 : demande refusée, message générique', async () => {
    http.post.mockRejectedValue(axiosError(400, 'msisdn invalid format'));
    const error = await init().catch(e => e);
    expect(error.kind).toBe('invalid');
    expect(error.httpStatus).toBe(400);
    expect(error.message).not.toMatch(/msisdn/);
  });
});

describe('succès', () => {
  it('une initiation réussie renvoie l\'identifiant de transaction', async () => {
    http.post.mockResolvedValue({ data: { status: { success: true }, transaction: { id: 'TXN-42' } } });
    expect(await init()).toMatchObject({ transaction_id: 'TXN-42' });
  });
});

describe('classification pure', () => {
  it.each([
    ['Moov gateway error: 502 Bad Gateway', 502],
    ['Service Unavailable', 503],
    ['upstream request timeout', undefined],
    ['Erreur', 599],
    ['Passerelle indisponible', undefined],
  ])('« %s » (%s) est une panne', (message, code) => {
    expect(classifyProviderFailure(message, code).kind).toBe('unavailable');
  });

  it.each([['PIN incorrect', 4010], ['Numéro non enregistré', 404], ['Plafond journalier dépassé', undefined]])('« %s » est un refus', (message, code) => {
    expect(classifyProviderFailure(message, code).kind).toBe('rejected');
  });

  it('un code 404 dans le corps n\'est pas une panne (numéro inconnu)', () => {
    expect(classifyProviderFailure('Abonné introuvable', 404).kind).toBe('rejected');
  });

  it('fromHttpFailure sans statut ni code : panne réseau', () => {
    expect(fromHttpFailure(undefined, undefined, 'boom').kind).toBe('unavailable');
  });
});
