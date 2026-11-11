import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => ({ sendPushToAdmins: vi.fn() }));
const mail = vi.hoisted(() => ({ sendNewOrderStaffEmail: vi.fn(async () => undefined) }));
vi.mock('../services/push.service.js', () => push);
vi.mock('../services/email.service.js', () => mail);
vi.mock('../services/adminEmail.service.js', () => ({ getAdminEmail: vi.fn(async () => 'equipe@ladelicieuse.test') }));
vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { alertStaffNewOrder } = await import('../services/staffAlerts.js');

const order = {
  _id: 'abc123', numero: 'LDD-0042', total: 10500, modeCommande: 'livraison',
  items: [{ nom: 'Salade', qty: 2 }, { nom: 'Jus', qty: 1 }],
  client: { nom: 'Salami', prenoms: 'Ale', telephone: '+24177123456', adresse: 'Libreville — Batterie 4' },
};

beforeEach(() => {
  vi.clearAllMocks();
  push.sendPushToAdmins.mockResolvedValue({ sent: 2, failed: 0, removed: 0 });
});

describe('alerte équipe — nouvelle commande', () => {
  it('push joint au moins un appareil : pas d\'e-mail (pas de doublon)', async () => {
    expect(await alertStaffNewOrder(order)).toEqual({ push: 2, email: false });
    expect(mail.sendNewOrderStaffEmail).not.toHaveBeenCalled();
  });

  it('contenu du push : commande, client, montant, mode, lien vers les commandes, tag unique', async () => {
    await alertStaffNewOrder(order);
    expect(push.sendPushToAdmins).toHaveBeenCalledWith({
      title: 'Nouvelle commande LDD-0042',
      body: 'Ale Salami · 10 500 FCFA · 3 articles · livraison',
      url: '/admin/commandes',
      tag: 'staff-order-abc123',
    });
  });

  it('retrait sur place : le mode est annoncé', async () => {
    await alertStaffNewOrder({ ...order, modeCommande: 'sur_place' });
    expect(push.sendPushToAdmins).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('retrait sur place') }));
  });

  it.each([
    ['aucun appareil abonné ou push non configuré', () => push.sendPushToAdmins.mockResolvedValue({ sent: 0, failed: 0, removed: 0 })],
    ['tous les envois ont échoué', () => push.sendPushToAdmins.mockResolvedValue({ sent: 0, failed: 2, removed: 1 })],
    ['le service push plante', () => push.sendPushToAdmins.mockRejectedValue(new Error('boom'))],
  ])('%s : e-mail de secours à l\'adresse de l\'administrateur', async (_label, arrange) => {
    arrange();
    expect(await alertStaffNewOrder(order)).toEqual({ push: 0, email: true });
    expect(mail.sendNewOrderStaffEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendNewOrderStaffEmail).toHaveBeenCalledWith('equipe@ladelicieuse.test', expect.objectContaining({
      numero: 'LDD-0042', clientNom: 'Ale Salami', telephone: '+24177123456', total: 10500, modeCommande: 'livraison',
      items: [{ nom: 'Salade', qty: 2 }, { nom: 'Jus', qty: 1 }],
    }));
  });

  it('push ET e-mail en panne : ne lève jamais d\'erreur (la commande ne doit pas échouer)', async () => {
    push.sendPushToAdmins.mockRejectedValue(new Error('push down'));
    mail.sendNewOrderStaffEmail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(alertStaffNewOrder(order)).resolves.toEqual({ push: 0, email: false });
  });
});
