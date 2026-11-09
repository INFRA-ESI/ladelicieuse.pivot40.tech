/**
 * Clé de comparaison de noms de catégorie : sans accents, en minuscules, mots sans « s » final.
 * « Sauce et pain » et « Sauces et Pains » donnent la même clé.
 */
export const similarKey = (nom: string): string =>
  nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map(w => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ');
