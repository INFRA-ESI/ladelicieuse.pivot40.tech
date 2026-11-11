// Créneaux de livraison / retrait. Aujourd'hui, un créneau dont l'heure de début est déjà passée n'est pas sélectionnable.
// MIN_LEAD_MS ajoute, si besoin, un délai de préparation (0 = seule l'heure déjà passée est refusée).
export const MIN_LEAD_MS = 0;

// Date locale au format YYYY-MM-DD, sans passer par l'UTC (qui donnerait la veille juste après minuit à UTC+1).
export function toLocalDateStr(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Heure de début d'un créneau, en minutes depuis minuit. Les créneaux sont réglés dans le back-office et peuvent être
// « 09h00 », « 14h30 » ou une plage « 13h30 - 14h00 » : seule la première heure compte. null si le format est inconnu.
function slotStartMinutes(slot: string): number | null {
  const m = /^\s*(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(slot);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

export function isSlotAvailable(slot: string, selectedDate: string, now: Date = new Date()): boolean {
  if (selectedDate !== toLocalDateStr(now)) return true;
  const minutes = slotStartMinutes(slot);
  if (minutes === null) return false;
  const start = new Date(now);
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return start.getTime() > now.getTime() + MIN_LEAD_MS;
}
