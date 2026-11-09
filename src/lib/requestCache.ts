// Cache mémoire des lectures API : revenir sur une page déjà chargée ne relance pas la requête
// tant que la donnée est jeune. Il vit le temps de l'onglet (vidé à l'actualisation de la page).

interface Entry { data: unknown; expiresAt: number }

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
// Incrémenté à chaque vidage : une réponse arrivée après une modification ne doit pas ré-alimenter le cache.
let generation = 0;

/**
 * Renvoie la valeur en cache si elle est encore valable, sinon appelle `load` et la mémorise.
 * Deux appels simultanés sur la même clé partagent une seule requête.
 * `ttlMs <= 0` : pas de cache, la donnée est toujours rechargée.
 * La valeur est clonée : un composant qui modifie son tableau ne corrompt pas le cache.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (ttlMs <= 0) return load();

  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return structuredClone(hit.data) as T;

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    const startedAt = generation;
    pending = load()
      .then(data => {
        if (startedAt === generation) store.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return structuredClone(await pending);
}

/** Vide tout le cache : à appeler après toute écriture (création, modification, suppression) ou déconnexion. */
export function clearRequestCache(): void {
  generation++;
  store.clear();
  inflight.clear();
}
