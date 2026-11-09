import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReport, createCollector, envoyer, normalizePath, shouldMeasure, viewportBucket, type VitalReport } from '@/lib/webVitals';

const env = (surcharge: Partial<Parameters<typeof shouldMeasure>[0]> = {}) => ({
  pathname: '/jus/detox', doNotTrack: false, viewportWidth: 412, connection: '4g', ...surcharge,
});
const metric = (name: string, value: number, rating = 'good') =>
  ({ name, value, rating, navigationType: 'navigate' }) as Parameters<typeof buildReport>[0];

afterEach(() => { vi.unstubAllGlobals(); });

describe('normalizePath — aucune donnée personnelle dans la page envoyée', () => {
  it.each([
    ['/', '/'],
    ['/jus/detox', '/jus/detox'],
    ['/composer', '/composer'],
    ['/commande/6aef95ccaba90b360cda5481', '/commande/:id'],                                  // identifiant Mongo
    ['/suivi/123e4567-e89b-12d3-a456-426614174000', '/suivi/:id'],                            // UUID
    ['/commande/123456789', '/commande/:id'],                                                  // numéro long
    ['/reinitialiser/' + 'a'.repeat(64), '/reinitialiser/:id'],                               // jeton
    ['/profil/eric.moussavou@example.com', '/profil/:id'],                                    // e-mail
    ['/profil/eric.moussavou%40example.com', '/profil/:id'],                                  // e-mail encodé
  ])('%s → %s', (entree, attendu) => {
    expect(normalizePath(entree)).toBe(attendu);
  });

  it('borne la longueur du chemin', () => {
    expect(normalizePath('/' + 'a/'.repeat(200)).length).toBeLessThanOrEqual(100);
  });
});

describe('buildReport — liste blanche de champs', () => {
  it("ne contient que les champs autorisés, valeurs arrondies, sans paramètres d'URL", () => {
    const rapport = buildReport(metric('LCP', 2417.6), env({ pathname: '/jus/detox' }), '/jus/detox');
    expect(Object.keys(rapport).sort()).toEqual(['connection', 'name', 'navigation', 'page', 'rating', 'value', 'viewport']);
    expect(rapport).toEqual({ name: 'LCP', value: 2418, rating: 'good', page: '/jus/detox', navigation: 'navigate', connection: '4g', viewport: 'xs' });
  });

  it('arrondit le CLS à 4 décimales et les temps à la milliseconde', () => {
    expect(buildReport(metric('CLS', 0.0123456), env(), '/').value).toBe(0.0123);
    expect(buildReport(metric('INP', 183.4), env(), '/').value).toBe(183);
  });

  it("un champ inattendu présent sur la métrique ou l'environnement ne part jamais", () => {
    const metriqueChargee = { ...metric('CLS', 0.1), id: 'v5-123', entries: [{ secret: 1 }], delta: 0.1 };
    const envChargee = { ...env(), userId: 'abc', email: 'x@y.ga', search: '?token=1' } as unknown as Parameters<typeof buildReport>[1];
    const json = JSON.stringify(buildReport(metriqueChargee, envChargee, '/connexion?email=eric@example.com#frag'));
    expect(json).not.toMatch(/v5-123|secret|abc|x@y\.ga|token|eric@example|frag|\?/);
  });

  it('la page envoyée est celle de la page d\'atterrissage normalisée', () => {
    expect(buildReport(metric('CLS', 0), env(), '/commande/6aef95ccaba90b360cda5481').page).toBe('/commande/:id');
  });
});

describe('viewportBucket', () => {
  it.each([[320, 'xs'], [479, 'xs'], [480, 'sm'], [767, 'sm'], [768, 'md'], [1023, 'md'], [1024, 'lg'], [1439, 'lg'], [1440, 'xl'], [2560, 'xl']] as const)(
    '%i px → %s', (largeur, palier) => { expect(viewportBucket(largeur)).toBe(palier); });
});

describe('shouldMeasure — qui est mesuré', () => {
  it('mesure une visite ordinaire du site public', () => {
    expect(shouldMeasure(env(), 1)).toBe(true);
  });

  it('ne mesure pas un visiteur qui refuse le suivi (Do Not Track / Global Privacy Control)', () => {
    expect(shouldMeasure(env({ doNotTrack: true }), 1)).toBe(false);
  });

  it("ne mesure pas l'administration", () => {
    expect(shouldMeasure(env({ pathname: '/admin' }), 1)).toBe(false);
    expect(shouldMeasure(env({ pathname: '/admin/commandes' }), 1)).toBe(false);
    expect(shouldMeasure(env({ pathname: '/administration-publique' }), 1)).toBe(true); // seul le préfixe exact /admin est exclu
  });

  it("respecte l'échantillonnage : 0 = jamais, 1 = toujours, 0,25 = une visite sur quatre", () => {
    expect(shouldMeasure(env(), 0, () => 0)).toBe(false);
    expect(shouldMeasure(env(), 1, () => 0.999)).toBe(true);
    expect(shouldMeasure(env(), 0.25, () => 0.2)).toBe(true);
    expect(shouldMeasure(env(), 0.25, () => 0.3)).toBe(false);
  });
});

describe('createCollector — envoi fiable et léger', () => {
  const rapport = (name: VitalReport['name'], value: number): VitalReport =>
    buildReport(metric(name, value), env(), '/jus/detox');

  it("n'envoie RIEN sans adresse de collecte", () => {
    const send = vi.fn();
    const collecteur = createCollector({ endpoint: undefined, send });
    collecteur.add(rapport('LCP', 2000));
    collecteur.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("n'envoie rien quand aucune métrique n'est arrivée", () => {
    const send = vi.fn();
    createCollector({ endpoint: 'https://collecte.test/vitals', send }).flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('envoie UN SEUL lot JSON avec les dernières valeurs de chaque métrique', () => {
    const send = vi.fn();
    const collecteur = createCollector({ endpoint: 'https://collecte.test/vitals', send });
    collecteur.add(rapport('LCP', 2000));
    collecteur.add(rapport('LCP', 2400));   // LCP mis à jour : seule la dernière valeur compte
    collecteur.add(rapport('CLS', 0.05));
    collecteur.add(rapport('INP', 150));
    collecteur.flush();

    expect(send).toHaveBeenCalledTimes(1);
    const [url, corps] = send.mock.calls[0];
    expect(url).toBe('https://collecte.test/vitals');
    const lot = (JSON.parse(corps) as { metrics: VitalReport[] }).metrics;
    expect(lot.map(m => [m.name, m.value]).sort()).toEqual([['CLS', 0.05], ['INP', 150], ['LCP', 2400]]);
  });

  it("ne renvoie pas une valeur déjà envoyée (pas de doublon quand la page est masquée plusieurs fois)", () => {
    const send = vi.fn();
    const collecteur = createCollector({ endpoint: 'https://collecte.test/vitals', send });
    collecteur.add(rapport('LCP', 2000));
    collecteur.flush();
    collecteur.flush();                      // rien de nouveau
    expect(send).toHaveBeenCalledTimes(1);

    collecteur.add(rapport('INP', 220));     // nouvelle métrique : seule celle-ci part
    collecteur.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect((JSON.parse(send.mock.calls[1][1]) as { metrics: VitalReport[] }).metrics.map(m => m.name)).toEqual(['INP']);

    collecteur.add(rapport('INP', 330));     // valeur changée : renvoyée
    collecteur.flush();
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('envoyer — ne bloque et ne casse jamais la page', () => {
  it('utilise fetch « keepalive » SANS cookies', () => {
    const fetchSimule = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSimule);
    envoyer('https://collecte.test/vitals', '{"metrics":[]}');
    expect(fetchSimule).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSimule.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://collecte.test/vitals');
    expect(options).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit', mode: 'no-cors' });
    // Requête « simple » : pas de preflight, donc pas de configuration CORS à prévoir côté collecteur.
    expect((options.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
  });

  it("retombe sur sendBeacon quand fetch n'existe pas", () => {
    vi.stubGlobal('fetch', undefined);
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beacon });
    envoyer('https://collecte.test/vitals', '{"metrics":[]}');
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("n'échoue pas quand l'envoi plante (réseau coupé, adresse invalide)", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau coupé'); }));
    expect(() => envoyer('https://collecte.test/vitals', '{}')).not.toThrow();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('synchrone'); }));
    expect(() => envoyer('https://collecte.test/vitals', '{}')).not.toThrow();
    await Promise.resolve();
  });
});
