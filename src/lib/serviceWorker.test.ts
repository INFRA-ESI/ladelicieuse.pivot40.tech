import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Charge public/sw.js dans un faux contexte de service worker et appelle ses écouteurs, comme le ferait le navigateur.
type Listener = (event: Record<string, unknown>) => void;

function loadWorker() {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn(async () => undefined);
  const windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }[] = [];
  const openWindow = vi.fn(async () => undefined);
  const self = {
    location: { origin: 'https://ladelicieuse.test' },
    addEventListener: (name: string, fn: Listener) => { listeners[name] = fn; },
    registration: { showNotification },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => windows), openWindow },
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches: { open: vi.fn(), keys: vi.fn(async () => []), match: vi.fn(), delete: vi.fn() }, URL, fetch: vi.fn(), Promise, Error });
  const waiting: Promise<unknown>[] = [];
  const dispatch = (name: string, event: Record<string, unknown>) => {
    listeners[name]({ ...event, waitUntil: (p: Promise<unknown>) => waiting.push(p) });
    return Promise.all(waiting);
  };
  return { dispatch, showNotification, windows, openWindow };
}

const pushEvent = (data: unknown) => ({ data: { json: () => { if (data instanceof Error) throw data; return data; }, text: () => 'texte brut' } });

let sw: ReturnType<typeof loadWorker>;
beforeEach(() => { sw = loadWorker(); });

describe('service worker — réception d\'un push', () => {
  it('affiche titre, texte, icône, et le lien à ouvrir', async () => {
    await sw.dispatch('push', pushEvent({ title: 'Commande prête', body: 'Elle vous attend', url: '/mon-compte' }));
    expect(sw.showNotification).toHaveBeenCalledWith('Commande prête', expect.objectContaining({
      body: 'Elle vous attend', icon: '/icons/icon-192.png', data: { url: '/mon-compte' },
    }));
  });

  it('un tag remplace la notification précédente de la même commande et re-sonne', async () => {
    await sw.dispatch('push', pushEvent({ title: 'T', body: 'B', tag: 'order-9' }));
    expect(sw.showNotification).toHaveBeenCalledWith('T', expect.objectContaining({ tag: 'order-9', renotify: true }));
  });

  it('sans tag : ni tag ni renotify (renotify sans tag est invalide)', async () => {
    await sw.dispatch('push', pushEvent({ title: 'T', body: 'B' }));
    const options = sw.showNotification.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(options[1]).not.toHaveProperty('tag');
    expect(options[1]).not.toHaveProperty('renotify');
  });

  it('iPhone : TOUJOURS une notification, même pour un message vide ou illisible (sinon Safari retire l\'abonnement)', async () => {
    await sw.dispatch('push', { data: null });
    await sw.dispatch('push', pushEvent(new Error('JSON invalide')));
    await sw.dispatch('push', pushEvent({}));
    expect(sw.showNotification).toHaveBeenCalledTimes(3);
    expect((sw.showNotification.mock.calls[0] as unknown as [string])[0]).toBe('La Délicieuse Diète');
  });
});

describe('service worker — toucher une notification', () => {
  const click = (url?: string) => ({ notification: { close: vi.fn(), data: url === undefined ? undefined : { url } } });

  it('appli fermée : ouvre le lien', async () => {
    await sw.dispatch('notificationclick', click('/mon-compte'));
    expect(sw.openWindow).toHaveBeenCalledWith('https://ladelicieuse.test/mon-compte');
  });

  it('appli déjà ouverte : la ramène devant et y navigue, sans ouvrir une 2e fenêtre', async () => {
    const win = { url: 'https://ladelicieuse.test/panier', focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) };
    sw.windows.push(win);
    await sw.dispatch('notificationclick', click('/mon-compte'));
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith('https://ladelicieuse.test/mon-compte');
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('ferme la notification touchée', async () => {
    const event = click('/mon-compte');
    await sw.dispatch('notificationclick', event);
    expect(event.notification.close).toHaveBeenCalled();
  });

  it.each(['https://pirate.example/phishing', '//pirate.example/x', 'javascript:alert(1)'])('lien hors du site (%s) : jamais suivi, retour à l\'accueil', async (url) => {
    await sw.dispatch('notificationclick', click(url));
    const opened = (sw.openWindow.mock.calls[0] as unknown as [string])[0];
    expect(new URL(opened).origin).toBe('https://ladelicieuse.test');
    expect(opened).not.toContain('pirate');
  });

  it('notification sans lien : accueil', async () => {
    await sw.dispatch('notificationclick', click());
    expect(sw.openWindow).toHaveBeenCalledWith('https://ladelicieuse.test/');
  });
});
