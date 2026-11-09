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

export const normalizeGabonPhoneNumber = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  // 24177XXXXXX — international sans +
  if (cleaned.startsWith('241') && cleaned.length === 11) return '+' + cleaned;
  // 077XXXXXX — local avec zéro
  if (cleaned.startsWith('0') && cleaned.length === 9) return '+241' + cleaned.slice(1);
  // 77XXXXXX — 8 chiffres nationaux
  if (cleaned.length === 8) return '+241' + cleaned;
  return '+' + cleaned;
};

export const validateGabonPhoneNumber = (phoneNumber: string): boolean => {
  const normalized = normalizeGabonPhoneNumber(phoneNumber);
  // Gabon : +241 suivi de 8 chiffres (préfixes Airtel 74/76/77, Moov 62/66)
  return /^\+241[0-9]{8}$/.test(normalized);
};
