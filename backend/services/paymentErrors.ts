// Erreurs de paiement en ligne, avec un message prévu pour le CLIENT. Les détails techniques (réponse brute de SingPay,
// noms de variables d'environnement, codes internes) restent dans les journaux : ils n'ont rien à faire dans le navigateur.

export type PaymentErrorKind =
  | 'unavailable'  // passerelle de l'opérateur ou de SingPay en panne / injoignable : réessayer plus tard
  | 'rejected'     // l'opérateur refuse la demande (solde, numéro, plafond…) : message de l'opérateur
  | 'invalid'      // demande mal formée de notre côté
  | 'config';      // identifiants SingPay refusés, endpoint introuvable : problème côté boutique, pas côté client

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly kind: PaymentErrorKind,
    /** Détail technique, journalisé uniquement. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }

  get httpStatus(): number {
    return this.kind === 'rejected' || this.kind === 'invalid' ? 400 : 503;
  }

  get code(): string {
    return this.kind === 'unavailable' || this.kind === 'config' ? 'PROVIDER_UNAVAILABLE' : 'PAYMENT_REJECTED';
  }
}

export type MobileProvider = 'airtel' | 'moov';
const providerLabel = (p?: MobileProvider): string => (p === 'moov' ? 'Moov Money' : p === 'airtel' ? 'Airtel Money' : 'Le paiement en ligne');

export function unavailableError(provider?: MobileProvider, detail?: string): PaymentError {
  const name = providerLabel(provider);
  return new PaymentError(
    `${name} est momentanément indisponible. Réessayez dans quelques instants, ou choisissez un autre moyen de paiement (Airtel Money, Moov Money, carte bancaire ou espèces).`,
    'unavailable',
    detail,
  );
}

// Un refus de passerelle (« Moov gateway error: 502 Bad Gateway ») est une PANNE, pas un refus du client : on le reconnaît
// à son code (5xx) ou à son texte, même quand SingPay répond HTTP 200 avec « success: false » dans le corps.
const GATEWAY_TEXT = /bad gateway|gateway|time-?out|timed out|temporar|unavailable|indisponible|service unavailable|upstream|\b50[0-4]\b/i;

export function classifyProviderFailure(message: unknown, code: unknown, provider?: MobileProvider): PaymentError {
  const text = typeof message === 'string' ? message.trim() : '';
  const numeric = Number(code);
  const detail = `${text || 'sans message'} (code: ${String(code ?? 'n/a')})`;
  if ((Number.isFinite(numeric) && numeric >= 500 && numeric <= 599) || GATEWAY_TEXT.test(text)) {
    return unavailableError(provider, detail);
  }
  // Refus « normal » de l'opérateur (solde insuffisant, numéro inconnu…) : son message est destiné au client, sans habillage technique.
  return new PaymentError(text || 'Le paiement a été refusé. Vérifiez votre numéro et votre solde, puis réessayez.', 'rejected', detail);
}

// Erreur HTTP ou réseau d'un appel à SingPay.
export function fromHttpFailure(status: number | undefined, errorCode: string | undefined, rawMessage: string, provider?: MobileProvider): PaymentError {
  // Pas de réponse du tout : coupure, délai dépassé, DNS.
  if (status === undefined) return unavailableError(provider, `${errorCode ?? 'réseau'}: ${rawMessage}`);
  if (status >= 500 || status === 408 || status === 429) return unavailableError(provider, `HTTP ${status}: ${rawMessage}`);
  if (status === 401 || status === 402 || status === 403 || status === 404) {
    // Identifiants refusés, solde du portefeuille de la boutique, endpoint introuvable : à corriger côté serveur.
    return new PaymentError(
      'Le paiement en ligne est momentanément indisponible. Choisissez un autre moyen de paiement ou contactez-nous.',
      'config',
      `HTTP ${status}: ${rawMessage}`,
    );
  }
  return new PaymentError('La demande de paiement a été refusée. Vérifiez votre numéro puis réessayez.', 'invalid', `HTTP ${status}: ${rawMessage}`);
}
