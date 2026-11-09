/**
 * Ne garde que les champs autorisés d'un corps de requête, avec des chaînes bornées en longueur.
 * Sert aux écritures publiques : ce qui n'est pas listé (statut, identifiants, dates système…) est ignoré.
 */
export function pickFields(
  body: unknown,
  allowed: readonly string[],
  maxStringLength = 300,
): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const source = body as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    const value = source[key];
    if (value === undefined) continue;
    picked[key] = typeof value === 'string' ? value.trim().slice(0, maxStringLength) : value;
  }
  return picked;
}
