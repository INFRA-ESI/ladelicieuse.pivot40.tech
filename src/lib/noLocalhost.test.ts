import { describe, expect, it } from 'vitest';

// Une adresse « localhost » écrite dans le code du site part telle quelle dans le build de production :
// le navigateur du client cherche alors le serveur sur son propre ordinateur (c'est ce qui cassait « Mon suivi »).
// Le site appelle l'API par des adresses relatives (/api/...), relayées par le serveur.
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('adresses du serveur', () => {
  it('aucun fichier du site ne vise localhost', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file))
      .filter(([, code]) => /localhost:\d+|127\.0\.0\.1/.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
