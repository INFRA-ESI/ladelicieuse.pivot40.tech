// Formatage des montants en FCFA : « 1 500 FCFA » (séparateur de milliers = espace insécable fine U+202F, comme fr-FR).
//
// Pourquoi ne pas appeler `new Intl.NumberFormat('fr-FR')` : la toute première utilisation d'Intl dans une page charge
// les données de langue du navigateur (de 60 à 220 ms mesurés sur téléphone ralenti), en pleine construction de la
// page. Les montants du site sont des entiers : on les groupe nous-mêmes, sans Intl. Tout le reste (décimaux, NaN,
// -0, texte, BigInt…) passe par Intl exactement comme avant, donc le rendu reste strictement identique.

const SEPARATEUR_MILLIERS = String.fromCharCode(0x202f); // espace insécable fine

function grouperEntier(valeur: number): string {
  const chiffres = String(Math.abs(valeur)); // entier sûr : jamais de notation exponentielle
  let groupes = '';
  for (let fin = chiffres.length; fin > 0; fin -= 3) {
    const tranche = chiffres.slice(Math.max(0, fin - 3), fin);
    groupes = groupes ? tranche + SEPARATEUR_MILLIERS + groupes : tranche;
  }
  return valeur < 0 ? '-' + groupes : groupes;
}

let formateurSecours: Intl.NumberFormat | undefined;

/** Montant suivi de « FCFA ». Résultat identique à `new Intl.NumberFormat('fr-FR').format(montant) + ' FCFA'`. */
export function formatPrixFcfa(montant: number): string {
  if (typeof montant === 'number' && Number.isSafeInteger(montant) && !Object.is(montant, -0)) {
    return grouperEntier(montant) + ' FCFA';
  }
  formateurSecours ??= new Intl.NumberFormat('fr-FR');
  return formateurSecours.format(montant) + ' FCFA';
}
