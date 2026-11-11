import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PushNotificationsCard from './PushNotificationsCard';

const BASE = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BKey', auth: 'aKey' } };

interface Setup { permission?: NotificationPermission; requestResult?: NotificationPermission; existingSub?: boolean; ios?: boolean; standalone?: boolean; push?: boolean }

const subscription = () => ({ ...BASE, toJSON: () => BASE, unsubscribe: vi.fn(async () => true) });

function setup({ permission = 'default', requestResult = 'granted', existingSub = false, ios = false, standalone = false, push = true }: Setup = {}) {
  const sub = subscription();
  const pushManager = {
    getSubscription: vi.fn(async () => (existingSub ? sub : null)),
    subscribe: vi.fn(async () => sub),
  };
  const reg = { pushManager };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  if (push) {
    (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};
    const notification = Object.assign(vi.fn(), { permission, requestPermission: vi.fn(async () => requestResult) });
    (window as unknown as { Notification: unknown }).Notification = notification;
  } else {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    delete (window as unknown as { Notification?: unknown }).Notification;
  }
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Safari' : 'Mozilla/5.0 Chrome/120' });
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: standalone });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('vapid-key')) return new Response(JSON.stringify({ success: true, publicKey: 'BEl6' }), { status: 200 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { pushManager, sub, fetchMock, requestPermission: (window as unknown as { Notification: { requestPermission: () => void } }).Notification?.requestPermission };
}

const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = String(v); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PushNotificationsCard — client', () => {
  it('ne demande JAMAIS l\'autorisation à l\'affichage : seulement un bouton explicite', async () => {
    const { requestPermission } = setup();
    render(<PushNotificationsCard audience="client" />);
    expect(await screen.findByRole('button', { name: 'Activer les notifications' })).toBeTruthy();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('au toucher : demande l\'autorisation EN PREMIER, abonne l\'appareil, envoie le jeton de session et aucun identifiant', async () => {
    store.ladelicieuse_token = 'jeton-client';
    const { requestPermission, pushManager, fetchMock } = setup();
    render(<PushNotificationsCard audience="client" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    await screen.findByText('Activées sur cet appareil');

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    const post = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/push/subscribe')) as unknown as [string, RequestInit];
    expect(post[1].method).toBe('POST');
    expect((post[1].headers as Record<string, string>).Authorization).toBe('Bearer jeton-client');
    const body = JSON.parse(String(post[1].body));
    expect(Object.keys(body)).toEqual(['subscription']);     // pas d'userId : l'identité vient de la session
    expect(body.subscription.endpoint).toBe(BASE.endpoint);
  });

  it('autorisation refusée par l\'utilisateur : message de blocage, rien n\'est enregistré', async () => {
    store.ladelicieuse_token = 'jeton-client';
    const { fetchMock, pushManager } = setup({ requestResult: 'denied' });
    render(<PushNotificationsCard audience="client" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect(await screen.findByText(/sont bloquées pour ce site/)).toBeTruthy();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('/subscribe'))).toBe(false);
  });

  it('autorisation fermée sans réponse : invite à réessayer', async () => {
    store.ladelicieuse_token = 'jeton-client';
    setup({ requestResult: 'default' });
    render(<PushNotificationsCard audience="client" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/réessayer/);
  });

  it('serveur qui refuse (session expirée) : message clair, l\'appareil n\'est pas déclaré activé', async () => {
    store.ladelicieuse_token = 'vieux-jeton';
    const { fetchMock } = setup();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('vapid-key') ? new Response(JSON.stringify({ success: true, publicKey: 'BEl6' })) : new Response('{}', { status: 401 }));
    render(<PushNotificationsCard audience="client" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Session expirée/);
    expect(screen.queryByText('Activées sur cet appareil')).toBeNull();
  });

  it('sans session : aucune requête d\'abonnement', async () => {
    const { fetchMock } = setup();
    render(<PushNotificationsCard audience="client" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Connectez-vous/);
    expect(fetchMock.mock.calls.some(c => String(c[0]).endsWith('/push/subscribe'))).toBe(false);
  });

  it('appareil déjà abonné : état « activées », et on peut désactiver (désabonnement local + serveur, avec le jeton)', async () => {
    store.ladelicieuse_token = 'jeton-client';
    const { sub, fetchMock } = setup({ permission: 'granted', existingSub: true });
    render(<PushNotificationsCard audience="client" />);
    expect(await screen.findByText('Activées sur cet appareil')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await screen.findByRole('button', { name: 'Activer les notifications' });
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    const del = fetchMock.mock.calls.find(c => ((c as unknown[])[1] as RequestInit | undefined)?.method === 'DELETE') as unknown as [string, RequestInit];
    expect(del[0]).toMatch(/\/push\/unsubscribe$/);
    expect((del[1].headers as Record<string, string>).Authorization).toBe('Bearer jeton-client');
  });
});

describe('PushNotificationsCard — iPhone', () => {
  it('Safari (onglet) : pas de bouton, les étapes d\'installation sur l\'écran d\'accueil', async () => {
    setup({ ios: true, standalone: false, push: false });
    render(<PushNotificationsCard audience="client" />);
    expect(await screen.findByText(/Sur l'écran d'accueil/)).toBeTruthy();
    expect(screen.getByText(/iOS 16.4/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activer les notifications' })).toBeNull();
  });

  it('site installé : le bouton apparaît', async () => {
    setup({ ios: true, standalone: true });
    render(<PushNotificationsCard audience="client" />);
    expect(await screen.findByRole('button', { name: 'Activer les notifications' })).toBeTruthy();
  });
});

describe('PushNotificationsCard — équipe', () => {
  it('utilise la route et le jeton administrateur, pas ceux d\'un client', async () => {
    store.admin_token = 'jeton-admin';
    store.ladelicieuse_token = 'jeton-client';
    const { fetchMock } = setup();
    render(<PushNotificationsCard audience="admin" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activer les notifications' }));
    await waitFor(() => expect(screen.getByText('Activées sur cet appareil')).toBeTruthy());
    const post = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/push/admin/subscribe')) as unknown as [string, RequestInit];
    expect(post).toBeTruthy();
    expect((post[1].headers as Record<string, string>).Authorization).toBe('Bearer jeton-admin');
  });

  it('navigateur sans notifications : message explicite', async () => {
    setup({ push: false });
    render(<PushNotificationsCard audience="admin" />);
    expect(await screen.findByText(/ne prend pas en charge les notifications/)).toBeTruthy();
  });
});
