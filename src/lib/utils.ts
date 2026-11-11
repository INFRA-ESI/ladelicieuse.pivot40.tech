import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatPrixFcfa } from "./fcfa";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formate un montant en FCFA avec séparateurs de milliers
 */
export const formatFCFA = (amount: number): string => formatPrixFcfa(amount);

// Mobile gabonais : 8 chiffres nationaux commençant par 6 ou 7 (Moov 60/62/65/66, Airtel 74/76/77…).
// Accepte « 077 12 34 56 », « 77123456 », « +241 77 12 34 56 », « 00241… », « 24177123456 » ; sortie « +24177123456 ».
// Même règle que le serveur (backend/utils/gabonPhone.ts) : à modifier des deux côtés.
export const normalizeGabonPhoneNumber = (phoneNumber: string): string => {
  const compact = phoneNumber.replace(/[\s().-]/g, '');
  const match = /^(?:(?:\+|00)?241)0?(\d{8})$/.exec(compact) ?? /^0?(\d{8})$/.exec(compact);
  return match ? `+241${match[1]}` : '+' + compact.replace(/\D/g, '');
};

export const validateGabonPhoneNumber = (phoneNumber: string): boolean =>
  /^\+241[67]\d{7}$/.test(normalizeGabonPhoneNumber(phoneNumber));
