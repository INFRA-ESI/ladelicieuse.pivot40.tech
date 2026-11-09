import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideInternalErrors } from '../middleware/hideInternalErrors.js';

// Fausse réponse : enregistre le corps réellement envoyé.
function run(path: string, statusCode: number, body: unknown) {
  let sent: unknown;
  const res = {
    statusCode,
    json(b: unknown) { sent = b; return this; },
  };
  const req = { method: 'POST', path, originalUrl: `/api${path}` };
  hideInternalErrors(req as never, res as never, () => { /* route suivante */ });
  res.json(body);
  return sent as Record<string, unknown>;
}

afterEach(() => vi.unstubAllEnvs());

describe('hideInternalErrors', () => {
  it("retire le champ error d'une réponse d'erreur en production", () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sent = run('/categories', 400, { success: false, message: 'Erreur création', error: 'E11000 duplicate key' });
    expect(sent).toEqual({ success: false, message: 'Erreur création' });
  });

  it('laisse le champ error en développement', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const sent = run('/categories', 400, { success: false, message: 'x', error: 'détail' });
    expect(sent.error).toBe('détail');
  });

  it('ne touche pas aux routes de paiement : le frontend affiche leur champ error', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sent = run('/payments/singpay/init', 409, { success: false, error: 'Paiement déjà en cours' });
    expect(sent.error).toBe('Paiement déjà en cours');
  });

  it('ne touche pas aux réponses réussies', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sent = run('/categories', 200, { success: true, data: [], error: 'sans importance' });
    expect(sent.error).toBe('sans importance');
  });

  it("laisse intactes les erreurs sans champ error", () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sent = run('/orders', 400, { success: false, message: 'Nom du client requis.' });
    expect(sent).toEqual({ success: false, message: 'Nom du client requis.' });
  });
});
