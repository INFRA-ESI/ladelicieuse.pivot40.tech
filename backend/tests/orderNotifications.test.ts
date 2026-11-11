import { describe, expect, it } from 'vitest';
import { statusNotification, newOrderNotification, CLIENT_ORDERS_URL, STAFF_ORDERS_URL } from '../services/orderNotifications.js';
import { buildStatusMessage } from '../services/whatsapp.service.js';

describe('statusNotification — tous les statuts, les deux modes', () => {
  const statuts = ['confirmee', 'en_preparation', 'prete', 'livree', 'annulee', 'remboursee'];

  it.each(statuts.flatMap(s => ['livraison', 'sur_place'].map(m => [s, m])))('%s / %s : titre et corps renseignés, numéro cité', (statut, mode) => {
    const n = statusNotification(statut, mode, 'LDD-0007');
    expect(n).not.toBeNull();
    expect(n!.title.length).toBeGreaterThan(3);
    expect(n!.body).toContain('LDD-0007');
  });

  it('« prête » : livraison ≠ retrait, et jamais de « livreur » pour un retrait', () => {
    const livraison = statusNotification('prete', 'livraison', 'LDD-1')!;
    const retrait = statusNotification('prete', 'sur_place', 'LDD-1')!;
    expect(livraison.title).toMatch(/livraison/i);
    expect(retrait.title).toMatch(/retirer/i);
    expect(`${retrait.title} ${retrait.body}`).not.toMatch(/livr/i);
  });

  it('« livrée » : un retrait est « retirée », jamais « livrée »', () => {
    const retrait = statusNotification('livree', 'sur_place', 'LDD-1')!;
    expect(retrait.title).toMatch(/retirée/i);
    expect(`${retrait.title} ${retrait.body}`).not.toMatch(/livrée/i);
    expect(statusNotification('livree', 'livraison', 'LDD-1')!.title).toMatch(/livrée/i);
  });

  it('mode absent ou inconnu : traité comme une livraison (comportement historique)', () => {
    expect(statusNotification('prete', undefined, 'LDD-1')).toEqual(statusNotification('prete', 'livraison', 'LDD-1'));
  });

  it('annulation : le motif saisi par l\'équipe est repris', () => {
    expect(statusNotification('annulee', 'livraison', 'LDD-1', 'Rupture de stock')!.body).toBe('Rupture de stock');
    expect(statusNotification('annulee', 'livraison', 'LDD-1', '   ')!.body).toContain('LDD-1');
  });

  it('« en attente » ou statut inconnu : aucune notification', () => {
    expect(statusNotification('en_attente', 'livraison', 'LDD-1')).toBeNull();
    expect(statusNotification('nimportequoi', 'livraison', 'LDD-1')).toBeNull();
  });

  it('les liens pointent vers des pages qui existent', () => {
    expect(CLIENT_ORDERS_URL).toBe('/mon-compte');
    expect(STAFF_ORDERS_URL).toBe('/admin/commandes');
  });
});

describe('WhatsApp — même logique de mode', () => {
  it('prête en retrait : pas de livreur', () => {
    const msg = buildStatusMessage('ORDER-LDD0001', 'Ale Salami', 'prete', undefined, 'sur_place');
    expect(msg).toMatch(/récupérer sur place/);
    expect(msg).not.toMatch(/livreur/);
  });

  it('prête en livraison : le livreur prend la route', () => {
    expect(buildStatusMessage('ORDER-LDD0001', 'Ale Salami', 'prete', undefined, 'livraison')).toMatch(/livreur/);
  });

  it('livrée en retrait : « retirée »', () => {
    expect(buildStatusMessage('ORDER-LDD0001', 'Ale Salami', 'livree', undefined, 'sur_place')).toMatch(/retirée/);
  });
});

describe('newOrderNotification', () => {
  it('singulier et pluriel des articles', () => {
    expect(newOrderNotification({ numero: 'LDD-1', total: 2500, modeCommande: 'sur_place', clientNom: 'Awa', itemCount: 1 }).body).toBe('Awa · 2 500 FCFA · 1 article · retrait sur place');
    expect(newOrderNotification({ numero: 'LDD-1', total: 2500, modeCommande: 'livraison', clientNom: 'Awa', itemCount: 2 }).body).toContain('2 articles');
  });
});
