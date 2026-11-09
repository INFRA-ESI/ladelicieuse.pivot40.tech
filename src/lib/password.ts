// Règle des mots de passe des comptes : 8 caractères minimum, une majuscule, un chiffre.
// Aucun caractère spécial n'est exigé (mais il est accepté).
// Miroir de backend/utils/password.ts : le serveur reste l'autorité, un test vérifie que les deux disent la même chose.

export const PASSWORD_HINT = '8 caractères minimum, avec une majuscule et un chiffre.';

/** Une ligne par condition, pour afficher la progression pendant la saisie. */
export const PASSWORD_RULES = [
  { label: '8 caractères minimum', test: (p: string) => p.length >= 8 },
  { label: 'Une majuscule',        test: (p: string) => /\p{Lu}/u.test(p) },
  { label: 'Un chiffre',           test: (p: string) => /[0-9]/.test(p) },
] as const;

/**
 * Message affiché quand la règle est violée à la CONNEXION (même phrase que le serveur : backend/utils/password.ts).
 * Un ancien compte au mot de passe trop faible est dirigé vers « Mot de passe oublié ».
 */
export function loginPasswordError(password: string): string | null {
  const error = passwordError(password);
  return error ? `${error} Pour votre sécurité, choisissez-en un nouveau avec « Mot de passe oublié ».` : null;
}

/** Premier manquement constaté, ou `null` si le mot de passe respecte la règle. */
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (password.length > 128) return 'Le mot de passe est trop long (128 caractères maximum).';
  // Toute majuscule compte, accentuée ou non (« Étienne1 », « Éric2026 »).
  if (!/\p{Lu}/u.test(password)) return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}
