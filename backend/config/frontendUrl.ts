// FRONTEND_URL peut lister plusieurs adresses du site (avec et sans « www ») séparées par des virgules.
// Pour les origines autorisées on les garde toutes ; pour bâtir un lien (e-mail, redirection de paiement) on prend la première.
export function frontendUrls(raw: string | undefined = process.env.FRONTEND_URL): string[] {
  return (raw ?? '')
    .split(',')
    .map(url => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function primaryFrontendUrl(): string | undefined {
  return frontendUrls()[0];
}
