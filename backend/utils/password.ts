import { z } from 'zod';

// Règle unique des mots de passe des comptes (clients et administrateur) : 8 caractères minimum,
// une majuscule, un chiffre. Aucun caractère spécial n'est exigé (mais il est accepté).
// Le miroir côté navigateur est src/lib/password.ts : un test vérifie que les deux disent la même chose.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Premier manquement constaté, ou `null` si le mot de passe respecte la règle. */
export function passwordError(password: unknown): string | null {
  if (typeof password !== 'string') return 'Le mot de passe est requis.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Le mot de passe est trop long (${PASSWORD_MAX_LENGTH} caractères maximum).`;
  // Toute majuscule compte, accentuée ou non (« Étienne1 », « Éric2026 »).
  if (!/\p{Lu}/u.test(password)) return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  if (!/[0-9]/.test(password)) return 'Le mot de passe doit contenir au moins un chiffre.';
  return null;
}

/**
 * Message affiché quand la règle est violée à la CONNEXION : même règle, avec la sortie de secours.
 * À n'évaluer qu'après avoir confirmé que le mot de passe est le bon (un mot de passe faux reste « identifiants incorrects »).
 */
export function loginPasswordError(password: unknown): string | null {
  const error = passwordError(password);
  return error ? `${error} Pour votre sécurité, choisissez-en un nouveau avec « Mot de passe oublié ».` : null;
}

/** Même règle sous forme de schéma zod, pour les routes qui valident leur corps avec zod. */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  const error = passwordError(password);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
});
