import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../config/logger.js', () => ({ logger: log }));

const { checkProductionConfig, assertProductionConfig } = await import('../config/production.config.js');

const GOOD_SECRET = 'a1b2c3d4'.repeat(8); // 64 caractères
const complete = {
  NODE_ENV: 'production',
  JWT_SECRET: GOOD_SECRET,
  MONGO_URI: 'mongodb://127.0.0.1:27017/ladelicieuse',
  ADMIN_EMAIL: 'admin@ladelicieuse.ga',
  ADMIN_PASSWORD: 'Un-vrai-mot-de-passe-2026',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token',
  EMAIL_USER: 'contact@ladelicieuse.ga',
  EMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop',
  FRONTEND_URL: 'https://ladelicieuse.pivot40.tech',
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
};

describe('configuration de production', () => {
  it('une configuration complète ne produit ni erreur ni alerte', () => {
    expect(checkProductionConfig(complete)).toEqual({ errors: [], warnings: [] });
    expect(() => assertProductionConfig(complete)).not.toThrow();
  });

  it("ne vérifie rien hors production (le développement local reste libre)", () => {
    expect(checkProductionConfig({ NODE_ENV: 'development' })).toEqual({ errors: [], warnings: [] });
    expect(checkProductionConfig({})).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ['absent', undefined],
    ['vide', '   '],
    ['trop court', 'abc123'],
    ["la valeur d'exemple du fichier .env.example", 'CHANGE_ME_IN_PRODUCTION_USE_64_RANDOM_BYTES'],
    ['une valeur d\'exemple même si elle est assez longue', 'change-me-'.repeat(5)],
  ])('refuse un JWT_SECRET %s', (_nom, valeur) => {
    const { errors } = checkProductionConfig({ ...complete, JWT_SECRET: valeur });
    expect(errors.join(' ')).toMatch(/JWT_SECRET/);
  });

  it('refuse un MONGO_URI absent', () => {
    expect(checkProductionConfig({ ...complete, MONGO_URI: undefined }).errors.join(' ')).toMatch(/MONGO_URI/);
  });

  it.each(['CHANGE_ME_IN_PRODUCTION', 'admin123', 'password'])("refuse le mot de passe administrateur d'exemple « %s »", valeur => {
    expect(checkProductionConfig({ ...complete, ADMIN_PASSWORD: valeur }).errors.join(' ')).toMatch(/ADMIN_PASSWORD/);
  });

  it('assertProductionConfig lève une erreur qui liste TOUS les problèmes, et les journalise', () => {
    log.error.mockClear();
    expect(() => assertProductionConfig({ ...complete, JWT_SECRET: 'court', MONGO_URI: undefined })).toThrow(/JWT_SECRET[\s\S]*MONGO_URI/);
    expect(log.error).toHaveBeenCalledTimes(2);
  });

  it("une dépendance manquante (Redis, e-mail, URL du site, VAPID) n'empêche PAS de démarrer mais est signalée", () => {
    log.warn.mockClear();
    const env = { ...complete, UPSTASH_REDIS_REST_URL: undefined, EMAIL_USER: undefined, FRONTEND_URL: undefined, VAPID_PUBLIC_KEY: undefined };
    const { errors, warnings } = checkProductionConfig(env);
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/Redis/);
    expect(warnings.join(' ')).toMatch(/EMAIL_USER/);
    expect(warnings.join(' ')).toMatch(/FRONTEND_URL/);
    expect(warnings.join(' ')).toMatch(/VAPID/);
    expect(() => assertProductionConfig(env)).not.toThrow();
    expect(log.warn).toHaveBeenCalled();
  });

  it('signale ALLOW_UNQUOTED_ORDERS=true : les prix du navigateur ne sont plus contrôlés', () => {
    expect(checkProductionConfig({ ...complete, ALLOW_UNQUOTED_ORDERS: 'true' }).warnings.join(' ')).toMatch(/ALLOW_UNQUOTED_ORDERS/);
    expect(checkProductionConfig({ ...complete, ALLOW_UNQUOTED_ORDERS: 'false' }).warnings).toEqual([]);
  });

  it("signale (sans bloquer) un ADMIN_PASSWORD qui ne respecte pas la règle : la connexion admin serait refusée", () => {
    const { errors, warnings } = checkProductionConfig({ ...complete, ADMIN_PASSWORD: 'motdepasse2026' });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/ADMIN_PASSWORD ne respecte pas la règle/);
    expect(() => assertProductionConfig({ ...complete, ADMIN_PASSWORD: 'motdepasse2026' })).not.toThrow();
  });

  it("signale l'absence de ADMIN_PASSWORD sans l'assimiler à une valeur d'exemple", () => {
    const { errors, warnings } = checkProductionConfig({ ...complete, ADMIN_PASSWORD: undefined });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/ADMIN_PASSWORD/);
  });
});
