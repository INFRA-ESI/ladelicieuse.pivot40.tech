import { describe, it, expect } from 'vitest';
import { isSlotAvailable, toLocalDateStr } from './deliverySlots';

// 11 novembre 2026, 14h20 en heure locale
const now = new Date(2026, 10, 11, 14, 20, 0);
const today = toLocalDateStr(now);

describe('isSlotAvailable', () => {
  it('refuse une heure déjà passée aujourd\'hui', () => {
    expect(isSlotAvailable('09h00', today, now)).toBe(false);
    expect(isSlotAvailable('14h00', today, now)).toBe(false);
  });

  it('refuse un créneau qui commence dans moins d\'une heure', () => {
    expect(isSlotAvailable('15h00', today, now)).toBe(false);
  });

  it('accepte un créneau qui commence dans plus d\'une heure', () => {
    expect(isSlotAvailable('16h00', today, now)).toBe(true);
    expect(isSlotAvailable('20h00', today, now)).toBe(true);
  });

  it('accepte tous les créneaux un autre jour', () => {
    expect(isSlotAvailable('09h00', '2026-11-12', now)).toBe(true);
  });

  it('refuse un créneau au format inconnu aujourd\'hui', () => {
    expect(isSlotAvailable('midi', today, now)).toBe(false);
  });

  it('comprend les créneaux à la demi-heure', () => {
    expect(isSlotAvailable('15h10', today, now)).toBe(false);
    expect(isSlotAvailable('15h20', today, now)).toBe(true);
  });
});

describe('toLocalDateStr', () => {
  it('garde le jour local juste après minuit', () => {
    expect(toLocalDateStr(new Date(2026, 10, 11, 0, 5))).toBe('2026-11-11');
  });
});
