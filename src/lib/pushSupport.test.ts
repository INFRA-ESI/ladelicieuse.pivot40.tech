import { describe, expect, it } from 'vitest';
import { pushAvailability, type PushEnvironment } from './pushSupport';

const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
  hasServiceWorker: true, hasPushManager: true, hasNotification: true,
  isIOS: false, isStandalone: false, permission: 'default', ...over,
});

describe('pushAvailability', () => {
  it('ordinateur ou Android avec un navigateur à jour : prêt', () => {
    expect(pushAvailability(env())).toBe('ready');
    expect(pushAvailability(env({ permission: 'granted' }))).toBe('ready');
  });

  it('iPhone dans un onglet Safari : installer le site sur l\'écran d\'accueil d\'abord', () => {
    // Dans un onglet Safari, PushManager et Notification n'existent pas : l'invitation à installer prime.
    expect(pushAvailability(env({ isIOS: true, isStandalone: false, hasPushManager: false, hasNotification: false }))).toBe('ios-install');
    expect(pushAvailability(env({ isIOS: true, isStandalone: false }))).toBe('ios-install');
  });

  it('iPhone, site installé et ouvert depuis l\'icône : prêt', () => {
    expect(pushAvailability(env({ isIOS: true, isStandalone: true }))).toBe('ready');
  });

  it('iPhone, site installé mais iOS trop ancien (pas de notifications web) : non pris en charge', () => {
    expect(pushAvailability(env({ isIOS: true, isStandalone: true, hasPushManager: false, hasNotification: false }))).toBe('unsupported');
  });

  it('navigateur sans service worker, sans push ou sans notifications : non pris en charge', () => {
    expect(pushAvailability(env({ hasServiceWorker: false }))).toBe('unsupported');
    expect(pushAvailability(env({ hasPushManager: false }))).toBe('unsupported');
    expect(pushAvailability(env({ hasNotification: false }))).toBe('unsupported');
  });

  it('autorisation refusée dans les réglages : bloqué, avec explication', () => {
    expect(pushAvailability(env({ permission: 'denied' }))).toBe('denied');
    expect(pushAvailability(env({ isIOS: true, isStandalone: true, permission: 'denied' }))).toBe('denied');
  });
});
