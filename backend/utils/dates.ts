// Jours « AAAA-MM-JJ » du calendrier de la boutique. Le Gabon est en UTC+1 toute l'année : « aujourd'hui » se lit à l'heure de
// Libreville, pas en UTC (entre minuit et 1 h, il serait sinon encore « hier »).
export const BOUTIQUE_TIMEZONE = 'Africa/Libreville';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function todayInBoutique(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOUTIQUE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Vrai pour une date qui existe au calendrier (le 30 février est refusé).
export function isRealDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
