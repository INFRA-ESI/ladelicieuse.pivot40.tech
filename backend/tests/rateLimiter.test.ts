import { describe, expect, it } from 'vitest';
import { memoryRateLimiter } from '../middleware/rateLimiter.js';

// Appelle le limiteur avec une fausse requête et renvoie ce qui s'est passé.
function call(limiter: ReturnType<typeof memoryRateLimiter>, ip: string, clientId?: string) {
  const headers: Record<string, unknown> = {};
  let status: number | undefined;
  let passed = false;
  const req = { headers: { 'x-forwarded-for': ip }, socket: { remoteAddress: '10.0.0.1' }, clientId };
  const res = {
    setHeader: (k: string, v: unknown) => { headers[k] = v; },
    status(s: number) { status = s; return res; },
    json: () => res,
  };
  limiter(req as never, res as never, () => { passed = true; });
  return { passed, status, headers };
}

describe('memoryRateLimiter', () => {
  it('laisse passer jusqu\'à la limite puis répond 429', () => {
    const limiter = memoryRateLimiter(3, 60, 'test-limite');
    const results = [1, 2, 3, 4].map(() => call(limiter, '1.1.1.1'));
    expect(results.slice(0, 3).every(r => r.passed)).toBe(true);
    expect(results[3].passed).toBe(false);
    expect(results[3].status).toBe(429);
  });

  it('indique au client combien de temps attendre (Retry-After)', () => {
    const limiter = memoryRateLimiter(1, 60, 'test-retry');
    call(limiter, '2.2.2.2');
    const blocked = call(limiter, '2.2.2.2');
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it("ne mélange pas les IP : une autre adresse n'est pas pénalisée", () => {
    const limiter = memoryRateLimiter(1, 60, 'test-ip');
    call(limiter, '3.3.3.3');
    expect(call(limiter, '3.3.3.3').passed).toBe(false);
    expect(call(limiter, '4.4.4.4').passed).toBe(true);
  });

  it('compte par utilisateur connecté quand perUser est activé (IP partagée)', () => {
    const limiter = memoryRateLimiter(2, 60, 'test-user', { perUser: true });
    call(limiter, '5.5.5.5', 'alice');
    call(limiter, '5.5.5.5', 'alice');
    expect(call(limiter, '5.5.5.5', 'alice').passed).toBe(false);
    expect(call(limiter, '5.5.5.5', 'bob').passed).toBe(true);
  });

  it('chaque limiteur a son propre compteur (étiquettes distinctes)', () => {
    const a = memoryRateLimiter(1, 60, 'test-a');
    const b = memoryRateLimiter(1, 60, 'test-b');
    call(a, '6.6.6.6');
    expect(call(a, '6.6.6.6').passed).toBe(false);
    expect(call(b, '6.6.6.6').passed).toBe(true);
  });
});
