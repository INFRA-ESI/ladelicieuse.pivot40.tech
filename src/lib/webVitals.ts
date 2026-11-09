import type { Metric } from 'web-vitals';

// Mesure des Core Web Vitals (LCP, INP, CLS) chez les visiteurs réels.
//
// Principes :
//  • Chargé APRÈS le premier affichage, en temps libre du navigateur, et dans un fichier séparé : il n'alourdit
//    ni le chargement initial ni le chemin critique (voir src/main.tsx).
//  • Confidentialité : le message ne contient que la métrique, sa valeur, sa note, la page visitée normalisée
//    (sans paramètres, sans fragment, sans identifiant), le type de connexion et un palier de largeur d'écran.
//    Aucun identifiant de visiteur, aucun cookie (credentials « omit »), aucune adresse, aucun jeton, aucun e-mail.
//  • Respect des signaux « Do Not Track » et « Global Privacy Control » : rien n'est mesuré dans ce cas.
//  • Aucun envoi réseau tant que VITE_VITALS_ENDPOINT n'est pas défini. Un événement `ld:web-vital` est toujours
//    émis sur `document` : un outil peut s'y brancher sans toucher au code.
//  • Le serveur (routes API) n'est pas concerné : l'adresse de collecte est une configuration externe.

export type VitalName = 'LCP' | 'INP' | 'CLS';

export interface VitalReport {
  name: VitalName;
  /** Millisecondes pour LCP et INP, score sans unité pour CLS. */
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  /** Page d'atterrissage de la visite, normalisée. */
  page: string;
  navigation: string;
  /** Type de connexion annoncé par le navigateur (« 4g », « 3g »…), vide s'il est inconnu. */
  connection: string;
  /** Palier de largeur d'écran. */
  viewport: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const CHAMPS_AUTORISES: ReadonlyArray<keyof VitalReport> = ['name', 'value', 'rating', 'page', 'navigation', 'connection', 'viewport'];

/** Segments qui ressemblent à un identifiant (Mongo, UUID, nombre long, jeton, e-mail) : remplacés par « :id ». */
const SEGMENT_IDENTIFIANT = /^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{5,}|[A-Za-z0-9_-]{24,})$/i;

/** Chemin sans paramètres ni fragment, identifiants masqués. */
export function normalizePath(pathname: string): string {
  const segments = pathname.split('/').map(segment => {
    let lisible = segment;
    try { lisible = decodeURIComponent(segment); } catch { /* segment mal encodé : traité tel quel */ }
    return lisible.includes('@') || SEGMENT_IDENTIFIANT.test(lisible) ? ':id' : segment;
  });
  return segments.join('/').slice(0, 100) || '/';
}

const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

export function viewportBucket(width: number): VitalReport['viewport'] {
  if (width < 480) return 'xs';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1440) return 'lg';
  return 'xl';
}

interface Environnement {
  pathname: string;
  doNotTrack: boolean;
  viewportWidth: number;
  connection: string;
}

export function readEnvironment(): Environnement {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; connection?: { effectiveType?: string } };
  return {
    pathname: window.location.pathname,
    doNotTrack: nav.doNotTrack === '1' || nav.globalPrivacyControl === true,
    viewportWidth: window.innerWidth,
    connection: nav.connection?.effectiveType ?? '',
  };
}

/** Faut-il mesurer cette visite ? Non si le visiteur refuse le suivi, sur l'administration, ou hors échantillon. */
export function shouldMeasure(env: Environnement, sampleRate = 1, random = Math.random): boolean {
  if (env.doNotTrack) return false;
  if (isAdminPath(env.pathname)) return false;
  return random() < sampleRate;
}

/** Message envoyé : uniquement les champs autorisés, valeurs arrondies. */
export function buildReport(metric: Pick<Metric, 'name' | 'value' | 'rating' | 'navigationType'>, env: Environnement, landingPath: string): VitalReport {
  const brut: VitalReport = {
    name: metric.name as VitalName,
    value: metric.name === 'CLS' ? Math.round(metric.value * 10_000) / 10_000 : Math.round(metric.value),
    rating: metric.rating,
    page: normalizePath(landingPath),
    navigation: metric.navigationType ?? '',
    connection: env.connection,
    viewport: viewportBucket(env.viewportWidth),
  };
  // Liste blanche explicite : un champ ajouté plus tard au type ne part pas par accident.
  return Object.fromEntries(CHAMPS_AUTORISES.map(champ => [champ, brut[champ]])) as unknown as VitalReport;
}

type Envoi = (url: string, corps: string) => void;

/**
 * Envoi qui ne bloque jamais la page : fetch « keepalive » sans cookies, ou sendBeacon à défaut.
 * Requête « simple » (text/plain, no-cors) : pas de requête préalable (preflight), donc aucune configuration CORS à prévoir
 * côté collecteur et un envoi plus fiable à la fermeture de la page. Le collecteur lit le corps comme du JSON.
 */
export const envoyer: Envoi = (url, corps) => {
  try {
    if (typeof fetch === 'function') {
      void fetch(url, { method: 'POST', body: corps, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, credentials: 'omit', mode: 'no-cors' }).catch(() => undefined);
      return;
    }
    navigator.sendBeacon?.(url, new Blob([corps], { type: 'text/plain;charset=UTF-8' }));
  } catch {
    // La mesure ne doit jamais perturber la page.
  }
};

/**
 * Garde la dernière valeur de chaque métrique et l'envoie en UN lot quand la page est masquée ou quittée
 * (moment où LCP, INP et CLS sont définitifs). Une valeur déjà envoyée n'est renvoyée que si elle a changé.
 */
export function createCollector({ endpoint, send = envoyer }: { endpoint?: string; send?: Envoi }) {
  const dernieres = new Map<VitalName, VitalReport>();
  const envoyees = new Map<VitalName, number>();

  return {
    add(report: VitalReport): void {
      dernieres.set(report.name, report);
    },
    flush(): void {
      if (!endpoint) return;
      const lot = [...dernieres.values()].filter(r => envoyees.get(r.name) !== r.value);
      if (lot.length === 0) return;
      lot.forEach(r => envoyees.set(r.name, r.value));
      send(endpoint, JSON.stringify({ metrics: lot }));
    },
  };
}

/** Démarre la mesure. À appeler une fois, après le premier affichage. */
export async function startWebVitals(): Promise<void> {
  const env = readEnvironment();
  const sample = Number(import.meta.env.VITE_VITALS_SAMPLE ?? 1);
  if (!shouldMeasure(env, Number.isFinite(sample) ? sample : 1)) return;

  const landingPath = env.pathname;
  const collector = createCollector({ endpoint: import.meta.env.VITE_VITALS_ENDPOINT });
  const { onLCP, onINP, onCLS } = await import('web-vitals');

  const reporter = (metric: Metric) => {
    const report = buildReport(metric, readEnvironment(), landingPath);
    collector.add(report);
    document.dispatchEvent(new CustomEvent('ld:web-vital', { detail: report }));
    if (import.meta.env.DEV) console.debug('[web-vitals]', report.name, report.value, report.rating, report.page);
  };
  onLCP(reporter);
  onINP(reporter);
  onCLS(reporter);

  const vider = () => collector.flush();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') vider(); });
  window.addEventListener('pagehide', vider);
}
