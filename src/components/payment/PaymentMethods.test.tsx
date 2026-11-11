import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentMethods } from './PaymentMethods';

beforeAll(() => {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as unknown as typeof IntersectionObserver;
});

const UNAVAILABLE = 'Moov Money est momentanément indisponible. Réessayez dans quelques instants, ou choisissez un autre moyen de paiement (Airtel Money, Moov Money, carte bancaire ou espèces).';

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openMoov = () => {
  render(<PaymentMethods amount={2500} orderId="ORDER-1" quote="signed-quote" />);
  fireEvent.click(screen.getByRole('button', { name: /Moov Money/ }));
  fireEvent.change(screen.getByPlaceholderText(/Ex :/), { target: { value: '066 12 34 56' } });
};
const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Payer/ }));

describe('PaymentMethods — panne de l\'opérateur', () => {
  it('affiche le message clair du serveur (pas de JSON brut) et propose les autres moyens de paiement', async () => {
    fetchMock.mockResolvedValue(reply(503, { success: false, error: UNAVAILABLE, code: 'PROVIDER_UNAVAILABLE' }));
    openMoov();
    pay();
    expect((await screen.findAllByText(UNAVAILABLE)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('"success"');
    expect(document.body.textContent).not.toContain('PROVIDER_UNAVAILABLE');
    const group = screen.getByRole('group', { name: 'Autres moyens de paiement' });
    expect(group.textContent).toMatch(/Airtel Money/);
    expect(group.textContent).toMatch(/Carte bancaire/);
    expect(group.textContent).toMatch(/Paiement en espèces/);
    expect(group.textContent).not.toMatch(/Moov Money/);   // le moyen en panne n'est pas reproposé
  });

  it('un clic sur un autre moyen l\'ouvre et efface l\'erreur', async () => {
    fetchMock.mockResolvedValue(reply(503, { success: false, error: UNAVAILABLE, code: 'PROVIDER_UNAVAILABLE' }));
    openMoov();
    pay();
    await screen.findByRole('group', { name: 'Autres moyens de paiement' });
    fireEvent.click(screen.getByRole('button', { name: 'Airtel Money' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Autres moyens de paiement' })).toBeNull());
    await waitFor(() => expect(screen.queryByText(UNAVAILABLE)).toBeNull());   // le volet Moov se referme (animation de sortie)
    expect(screen.getByPlaceholderText(/Ex :/)).toBeTruthy();   // formulaire Airtel ouvert
  });

  it('un refus ordinaire (solde insuffisant) n\'affiche pas la liste d\'alternatives', async () => {
    fetchMock.mockResolvedValue(reply(400, { success: false, error: 'Solde insuffisant', code: 'PAYMENT_REJECTED' }));
    openMoov();
    pay();
    expect((await screen.findAllByText('Solde insuffisant')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Autres moyens de paiement' })).toBeNull();
  });

  it('commande déjà payée (409) : message affiché tel quel, pas d\'alternatives', async () => {
    fetchMock.mockResolvedValue(reply(409, { success: false, error: 'Cette commande a déjà été payée.' }));
    openMoov();
    pay();
    expect((await screen.findAllByText('Cette commande a déjà été payée.')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Autres moyens de paiement' })).toBeNull();
  });

  it('nouvel essai après une panne : l\'erreur et les alternatives disparaissent dès que la demande repart', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(503, { success: false, error: UNAVAILABLE, code: 'PROVIDER_UNAVAILABLE' }))
      .mockResolvedValueOnce(reply(200, { success: true, data: { transactionId: 'TXN-1', message: 'ok' } }));
    openMoov();
    pay();
    await screen.findByRole('group', { name: 'Autres moyens de paiement' });
    pay();
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Autres moyens de paiement' })).toBeNull());
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/singpay/init'))).toHaveLength(2);
  });
});
