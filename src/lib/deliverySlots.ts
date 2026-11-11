// Créneaux de livraison / retrait. Aujourd'hui, un créneau n'est proposé que s'il reste au moins une heure avant son début
// (le temps de préparer la commande) : les heures déjà passées, ou trop proches, ne sont pas sélectionnables.
export const MIN_LEAD_MS = 60 * 60 * 1000;

// Date locale au format YYYY-MM-DD, sans passer par l'UTC (qui donnerait la veille juste après minuit à UTC+1).
export function toLocalDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Créneau « 09h00 » ou « 14h30 » → minutes depuis minuit ; null si le format n'est pas reconnu.
function slotMinutes(slot: string): number | null {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(slot.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

export function isSlotAvailable(slot: string, selectedDate: string, now: Date = new Date()): boolean {
  if (selectedDate !== toLocalDateStr(now)) return true;
  const minutes = slotMinutes(slot);
  if (minutes === null) return false;
  const start = new Date(now);
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return start.getTime() >= now.getTime() + MIN_LEAD_MS;
}
