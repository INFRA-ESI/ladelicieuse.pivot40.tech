// Lecture publique (sans authentification) — pour les pages clients
import { cached } from '@/lib/requestCache';

// Les données publiques (catalogue, tarifs, avis) changent rarement : une minute de cache
// évite de les redemander à chaque retour sur une page.
const PUBLIC_TTL_MS = 60_000;
const TIMEOUT_MS = 10_000;

/**
 * Corps JSON complet d'une lecture publique (`{ success, data, ... }`), mis en cache. Lève une erreur en cas d'échec.
 * Le type par défaut reste `any` comme l'ancien `response.json()` : chaque page valide elle-même ce qu'elle lit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cachedJson<T = any>(url: string, ttl = PUBLIC_TTL_MS): Promise<T> {
  return cached(`public|${url}`, ttl, async () => {
    // AbortController et non AbortSignal.timeout : ce dernier manque sur les iPhone avant iOS 16.4.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Renvoie `data` d'une réponse `{ success: true, data }`, ou null en cas d'échec (jamais mis en cache). */
export async function publicFetch<T>(url: string, ttl = PUBLIC_TTL_MS): Promise<T | null> {
  try {
    const json = await cachedJson<{ success?: boolean; data?: T }>(url, ttl);
    return json?.success ? (json.data as T) : null;
  } catch {
    return null;
  }
}
