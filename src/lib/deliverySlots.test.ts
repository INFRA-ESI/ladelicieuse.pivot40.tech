import { describe, it, expect } from 'vitest';
import { isSlotAvailable, toLocalDateStr } from './deliverySlots';

// 11 novembre 2026, 14h20 en heure locale
const now = new Date(2026, 10, 11, 14, 20, 0);
const today = toLocalDateStr(now);

describe('isSlotAvailable', () => {
  it("refuse une heure déjà passée aujourd'hui", () => {
    expect(isSlotAvailable('09h00', today, now)).toBe(false);
    expect(isSlotAvailable('14h00', today, now)).toBe(false);
  });

  it('accepte un créneau qui commence plus tard dans la journée', () => {
    expect(isSlotAvailable('15h00', today, now)).toBe(true);
    expect(isSlotAvailable('20h00', today, now)).toBe(true);
  });

  it('accepte tous les créneaux un autre jour', () => {
    expect(isSlotAvailable('09h00', '2026-11-12', now)).toBe(true);
  });

  it("refuse un créneau au format inconnu aujourd'hui", () => {
    expect(isSlotAvailable('midi', today, now)).toBe(false);
  });

  it('comprend les plages réglées dans le back-office (heure de début)', () => {
    expect(isSlotAvailable('08h30-09h30', today, now)).toBe(false);
    expect(isSlotAvailable('13h30 - 14h00', today, now)).toBe(false);
    expect(isSlotAvailable('14h30 - 15h00', today, now)).toBe(true);
    expect(isSlotAvailable('17h00 - 18h00', today, now)).toBe(true);
  });

  it('un créneau déjà commencé est refusé, un créneau qui commence à la minute suivante est accepté', () => {
    expect(isSlotAvailable('14h20', today, now)).toBe(false);
    expect(isSlotAvailable('14h21', today, now)).toBe(true);
  });
});

describe('toLocalDateStr', () => {
  it('garde le jour local juste après minuit', () => {
    expect(toLocalDateStr(new Date(2026, 10, 11, 0, 5))).toBe('2026-11-11');
  });
});
