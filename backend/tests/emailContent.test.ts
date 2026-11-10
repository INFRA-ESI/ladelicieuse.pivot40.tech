import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.hoisted(() => vi.fn(async (_mail: { html: string; text: string }) => undefined));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const { frontendUrls, primaryFrontendUrl } = await import('../config/frontendUrl.js');
const { sendLoginOTPEmail, sendPasswordResetEmail, sendAdminPasswordResetEmail, sendVerificationEmail } =
  await import('../services/email.service.js');

const sent = () => sendMail.mock.calls[0][0];
// Texte visible : ce que le destinataire lit, sans les attributs href des boutons.
const visibleText = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FRONTEND_URL', 'https://ladelicieuse.test,https://www.ladelicieuse.test/');
});

describe('FRONTEND_URL', () => {
  it('accepte plusieurs adresses séparées par des virgules et retire les « / » finaux', () => {
    expect(frontendUrls('https://a.test, https://www.a.test/')).toEqual(['https://a.test', 'https://www.a.test']);
  });

  it('utilise la première adresse pour bâtir les liens', () => {
    expect(primaryFrontendUrl()).toBe('https://ladelicieuse.test');
  });

  it("renvoie une liste vide quand la variable est absente ou vide", () => {
    expect(frontendUrls('')).toEqual([]);
    vi.stubEnv('FRONTEND_URL', '');
    expect(frontendUrls()).toEqual([]);
    expect(primaryFrontendUrl()).toBeUndefined();
  });
});

describe('contenu des e-mails', () => {
  const token = 'a'.repeat(64);

  it("le lien de réinitialisation client pointe vers une seule adresse, sans l'afficher en clair", async () => {
    await sendPasswordResetEmail('cliente@test.ga', 'Awa', token);
    const { html, text } = sent();
    const link = `https://ladelicieuse.test/reset-password?token=${token}`;
    expect(html).toContain(`href="${link}"`);
    expect(html).not.toMatch(/ladelicieuse\.test,/);
    expect(visibleText(html)).not.toContain('token=');
    expect(text).toContain(link);
  });

  it("le lien de réinitialisation admin n'affiche ni lien brut ni adresse IP", async () => {
    const link = `https://ladelicieuse.test/admin/reset-password?token=${token}`;
    await sendAdminPasswordResetEmail('admin@test.ga', link);
    const { html, text } = sent();
    expect(html).toContain(`href="${link}"`);
    expect(visibleText(html)).not.toContain('token=');
    expect(visibleText(html)).not.toMatch(/\bIP\b/);
    expect(text).not.toMatch(/\bIP\b/);
  });

  it("le code de connexion admin n'affiche aucune adresse IP", async () => {
    await sendLoginOTPEmail('admin@test.ga', '123456');
    const { html, text } = sent();
    expect(visibleText(html)).not.toMatch(/\bIP\b/);
    expect(text).not.toMatch(/\bIP\b/);
    expect(visibleText(html)).toContain('1');
  });

  it("le lien de vérification d'adresse n'affiche pas de lien brut", async () => {
    await sendVerificationEmail('cliente@test.ga', 'Awa', token);
    const { html } = sent();
    expect(html).toContain(`href="https://ladelicieuse.test/verify-email?token=${token}"`);
    expect(visibleText(html)).not.toContain('token=');
  });
});
