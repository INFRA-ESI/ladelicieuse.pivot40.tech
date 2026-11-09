import { logger } from './logger.js';
import { passwordError } from '../utils/password.js';

// Vérification de la configuration au démarrage, en production seulement.
//   • erreurs  : un secret manifestement faux ou une base absente. Le serveur REFUSE de démarrer :
//                mieux vaut un échec visible au déploiement qu'un site en marche avec un secret public.
//   • alertes  : une dépendance manquante (Redis, e-mail, URL du site…) qui dégrade une fonction sans mettre
//                la sécurité en jeu. Le serveur démarre, mais le journal le dit clairement.

type Env = Record<string, string | undefined>;

export interface ConfigReport {
  errors: string[];
  warnings: string[];
}

// Seulement les valeurs d'exemple réellement présentes dans .env.example : un motif trop large pourrait refuser un vrai secret.
const SECRET_PLACEHOLDER = /change[_-]?me/i;
const PASSWORD_PLACEHOLDER = /change[_-]?me|^admin123$|^password$/i;
const hasValue = (value: string | undefined): value is string => !!value && value.trim() !== '';

export function checkProductionConfig(env: Env = process.env): ConfigReport {
  const report: ConfigReport = { errors: [], warnings: [] };
  if (env.NODE_ENV !== 'production') return report;

  const { errors, warnings } = report;

  // ── Erreurs : le serveur ne démarre pas ──
  const secret = env.JWT_SECRET;
  if (!hasValue(secret)) errors.push('JWT_SECRET est absent.');
  else if (secret.length < 32) errors.push('JWT_SECRET est trop court (32 caractères minimum, 64 recommandés).');
  else if (SECRET_PLACEHOLDER.test(secret)) errors.push('JWT_SECRET est encore la valeur d\'exemple : générez-en un avec crypto.randomBytes(64).');

  if (!hasValue(env.MONGO_URI)) errors.push('MONGO_URI est absent.');

  if (hasValue(env.ADMIN_PASSWORD) && PASSWORD_PLACEHOLDER.test(env.ADMIN_PASSWORD)) {
    errors.push('ADMIN_PASSWORD est une valeur d\'exemple ou un mot de passe trivial.');
  }

  // ── Alertes : le serveur démarre ──
  // La connexion exige désormais un mot de passe conforme : un ADMIN_PASSWORD faible (utilisé seulement pour créer le
  // premier hash) rendrait la connexion administrateur impossible sans passer par « Mot de passe oublié ».
  if (hasValue(env.ADMIN_PASSWORD) && !PASSWORD_PLACEHOLDER.test(env.ADMIN_PASSWORD)) {
    const faible = passwordError(env.ADMIN_PASSWORD);
    if (faible) warnings.push(`ADMIN_PASSWORD ne respecte pas la règle des mots de passe (${faible.replace(/\.$/, '')}) : la connexion administrateur serait refusée.`);
  }
  if (!hasValue(env.ADMIN_PASSWORD)) warnings.push('ADMIN_PASSWORD absent : aucune connexion administrateur possible tant que le mot de passe n\'est pas défini.');
  if (!hasValue(env.ADMIN_EMAIL)) warnings.push('ADMIN_EMAIL absent : le code de connexion serait envoyé à l\'adresse par défaut.');
  if (!hasValue(env.UPSTASH_REDIS_REST_URL) || !hasValue(env.UPSTASH_REDIS_REST_TOKEN)) {
    warnings.push('Redis (UPSTASH_REDIS_REST_*) absent : le code de connexion administrateur (OTP) ne peut pas être enregistré, la connexion échouera.');
  }
  if (!hasValue(env.EMAIL_USER) || !hasValue(env.EMAIL_APP_PASSWORD)) {
    warnings.push('EMAIL_USER / EMAIL_APP_PASSWORD absents : aucun e-mail ne partira (code de connexion, confirmations de commande).');
  }
  if (!hasValue(env.FRONTEND_URL)) warnings.push('FRONTEND_URL absent : les liens de réinitialisation de mot de passe sont désactivés et seules les requêtes du même site sont acceptées.');
  if (env.ALLOW_UNQUOTED_ORDERS === 'true') warnings.push('ALLOW_UNQUOTED_ORDERS=true : les prix envoyés par le navigateur ne sont PAS contrôlés. À repasser à false dès la fin de la mise en ligne.');
  if (!hasValue(env.VAPID_PUBLIC_KEY) || !hasValue(env.VAPID_PRIVATE_KEY)) warnings.push('Clés VAPID absentes : les notifications push sont désactivées.');

  return report;
}

/** À appeler une fois au démarrage : journalise les alertes et lève une erreur si la configuration est inacceptable. */
export function assertProductionConfig(env: Env = process.env): void {
  const { errors, warnings } = checkProductionConfig(env);
  for (const warning of warnings) logger.warn(`[Config] ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) logger.error(`[Config] ${error}`);
    throw new Error(`Configuration de production invalide :\n - ${errors.join('\n - ')}`);
  }
}
