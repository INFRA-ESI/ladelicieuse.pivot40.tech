import bcrypt from 'bcryptjs';
import Settings from '../models/Settings.model.js';

const FALLBACK_EMAIL = 'admin@ladelicieuse.ga';

// L'adresse choisie depuis le back-office prime sur ADMIN_EMAIL, qui ne sert plus que de valeur de départ.
export async function getAdminEmail(): Promise<string> {
  const settings = await Settings.findOne().select('adminEmail');
  return (settings?.adminEmail || process.env.ADMIN_EMAIL || FALLBACK_EMAIL).trim().toLowerCase();
}

// Mot de passe de l'administrateur : le hash enregistré, sinon (avant tout changement) ADMIN_PASSWORD de l'environnement.
export async function isAdminPassword(candidate: string): Promise<boolean> {
  const settings = await Settings.findOne().select('+adminPasswordHash');
  if (settings?.adminPasswordHash) return bcrypt.compare(candidate, settings.adminPasswordHash);
  const envPassword = process.env.ADMIN_PASSWORD;
  return !!envPassword && candidate === envPassword;
}
