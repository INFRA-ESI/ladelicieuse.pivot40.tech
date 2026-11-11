import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { normalizeAppPassword } = await import('../services/email.service.js');

describe('mot de passe d\'application Google', () => {
  it('retire les espaces des quatre groupes', () => {
    expect(normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
    expect(normalizeAppPassword(' abcd\tefgh  ijkl mnop ')).toBe('abcdefghijklmnop');
  });

  it('laisse un mot de passe sans espaces et l\'absence de valeur', () => {
    expect(normalizeAppPassword('abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(normalizeAppPassword(undefined)).toBeUndefined();
  });
});
