// Numéro de mobile gabonais (8 chiffres nationaux, commençant par 6 ou 7 : Moov 60/62/65/66, Airtel 74/76/77…).
// Accepte « 077 12 34 56 », « 77123456 », « +241 77 12 34 56 », « 00241 77 12 34 56 », « 24177123456 », avec espaces,
// points, tirets ou parenthèses. Retourne la forme unique « +24177123456 », ou null si ce n'est pas un mobile gabonais.
// La même règle existe côté site (src/lib/utils.ts) : à modifier des deux côtés.
const NATIONAL_MOBILE = /^[67]\d{7}$/;

export function toGabonMobile(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 30) return null;
  const compact = input.replace(/[\s().-]/g, '');

  // « 241 » (avec +, 00 ou rien) suivi du numéro, éventuellement précédé du 0 de ligne ; sinon numéro national seul, avec 0 facultatif.
  const match = /^(?:(?:\+|00)?241)0?(\d{8})$/.exec(compact) ?? /^0?(\d{8})$/.exec(compact);
  if (!match || !NATIONAL_MOBILE.test(match[1])) return null;
  return `+241${match[1]}`;
}
