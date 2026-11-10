import { isPrefKey, type PrefKey } from '@/lib/dietary';

const API = '/api/client';

export interface ClientUser {
  id: string;
  /** `/api/client/me` renvoie l'identifiant sous `_id` (document Mongo), la connexion sous `id`. */
  _id?: string;
  nom: string;
  prenoms: string;
  email: string;
  telephone: string;
  points: number;
  tier: 'bronze' | 'argent' | 'or' | 'platine';
  avatar?: string;
}

export interface ClientOrder {
  id: string;
  numero: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  sousTotal: number;
  fraisLivraison: number;
  statut: 'en_attente' | 'confirmee' | 'en_preparation' | 'prete' | 'livree' | 'annulee' | 'remboursee';
  modePaiement: string;
  modeCommande: string;
  pointsGagnes: number;
}

export interface FideliteEntry {
  _id: string;
  type: 'gain' | 'rachat' | 'ajustement';
  points: number;
  soldeApres: number;
  description: string;
  createdAt: string;
}

export async function registerClient(data: { nom: string; prenoms: string; email: string; password: string; telephone?: string }) {
  const res = await fetch(`${API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Erreur lors de l'inscription");
  return json as { success: true; message: string };
}

export async function loginClient(email: string, password: string) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur de connexion');
  return json as { success: true; token: string; user: ClientUser };
}

export async function fetchMe(token: string) {
  const res = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Session expirée');
  return json.data as ClientUser;
}

export async function getClientOrders(token: string): Promise<ClientOrder[]> {
  const res = await fetch(`${API}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur chargement commandes');
  return (Array.isArray(json.data) ? json.data : []) as ClientOrder[];
}

export async function getClientFidelite(token: string): Promise<{
  points: number;
  tier: string;
  historique: FideliteEntry[];
}> {
  const res = await fetch(`${API}/fidelite`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur chargement fidélité');
  return json.data;
}

export async function redeemPoints(token: string, points: number): Promise<{
  code: string;
  valeurFCFA: number;
  soldeApres: number;
}> {
  const res = await fetch(`${API}/fidelite/racheter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ points }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur rachat points');
  return json.data;
}

export async function updateClientProfile(
  token: string,
  data: { nom: string; prenoms: string; telephone: string; email: string }
): Promise<ClientUser> {
  const res = await fetch(`${API}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur mise à jour profil');
  return json.data as ClientUser;
}

export async function changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API}/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Erreur changement mot de passe');
}

export async function getClientPreferences(token: string): Promise<PrefKey[]> {
  const res = await fetch(`${API}/preferences`, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Préférences indisponibles');
  return (json.data.preferences as unknown[]).filter(isPrefKey);
}

/** Enregistre en base et renvoie ce que le serveur a réellement retenu. Lève une erreur si l'enregistrement échoue. */
export async function saveClientPreferences(token: string, preferences: PrefKey[]): Promise<PrefKey[]> {
  const res = await fetch(`${API}/preferences`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferences }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Les préférences n'ont pas pu être enregistrées");
  return (json.data.preferences as unknown[]).filter(isPrefKey);
}

export async function uploadClientAvatar(token: string, photo: Blob): Promise<string> {
  const form = new FormData();
  form.append('avatar', photo, 'avatar.webp');
  const res = await fetch(`${API}/avatar`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "La photo n'a pas pu être enregistrée");
  return json.data.avatar as string;
}

export async function deleteClientAvatar(token: string): Promise<void> {
  const res = await fetch(`${API}/avatar`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "La photo n'a pas pu être retirée");
}
