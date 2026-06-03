/**
 * Chiffrement AES-256-GCM des champs sensibles (données de santé).
 *
 * AES-256-GCM = chiffrement authentifié :
 *   - confidentialité  : personne ne peut lire sans la clé
 *   - intégrité        : toute modification du chiffré est détectée (auth tag)
 *
 * Format stocké en base : "<iv_b64>:<tag_b64>:<cipher_b64>"
 *   - IV  (12 octets) : aléatoire par chiffrement — jamais réutilisé
 *   - Tag (16 octets) : GHASH d'authentification GCM
 *   - Cipher          : texte chiffré
 *
 * Clé : 32 octets (256 bits) stockés en hex dans FIELD_ENCRYPTION_KEY.
 *       Générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const SEP  = ':';

// Motif strict : trois blocs base64 séparés par ':'
const ENC_RE = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

/** Retourne la clé 32 octets depuis l'env. Lève une erreur claire si absente/invalide. */
function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      '[AES-256] FIELD_ENCRYPTION_KEY manquante ou invalide. ' +
      'Générez-la avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Renvoie true si la valeur semble être un chiffré produit par cette fonction. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && ENC_RE.test(value);
}

/** Chiffre une chaîne en AES-256-GCM. Renvoie le triplet iv:tag:cipher encodé en base64. */
export function encrypt(plaintext: string): string {
  const key    = getKey();
  const iv     = crypto.randomBytes(12);                           // 96-bit IV — recommandé GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();                              // 128-bit auth tag
  return [iv, tag, enc].map(b => b.toString('base64')).join(SEP);
}

/** Déchiffre et vérifie l'intégrité. Lève une erreur si le chiffré a été altéré. */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(SEP);
  if (parts.length !== 3) throw new Error('[AES-256] Format de chiffré invalide');
  const [iv, tag, enc] = parts.map(p => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Chiffre un nombre. Renvoie la chaîne chiffrée. */
export function encryptNumber(n: number): string {
  return encrypt(String(n));
}

/** Déchiffre vers un nombre. Renvoie undefined si la valeur est nulle ou invalide. */
export function decryptNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;         // donnée legacy non chiffrée
  if (isEncrypted(value)) {
    try { return Number(decrypt(value)); } catch { return undefined; }
  }
  return undefined;
}
