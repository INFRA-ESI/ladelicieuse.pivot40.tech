// Service API admin — ajoute automatiquement le JWT et gère les 401
import { ls } from '@/lib/storage';
import { cached, clearRequestCache } from '@/lib/requestCache';

// Durée pendant laquelle une lecture est réutilisée quand on revient sur une page.
const DEFAULT_TTL_MS = 60_000;

function headers(): HeadersInit {
  const token = ls.get('admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function handle401() {
  clearRequestCache();
  ls.remove('admin_token');
  ls.remove('admin_user');
  ls.remove('admin_logged_in');
  window.location.href = '/admin/login';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: headers() });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur serveur');
  return json as T;
}

/**
 * Lecture avec cache. `ttl` en ms : 0 pour toujours recharger (données en direct, comme les commandes).
 * Le cache est lié au jeton : une autre session admin ne voit pas les données de la précédente.
 */
export function adminGet<T = unknown>(path: string, options: { ttl?: number } = {}): Promise<T> {
  return cached(`admin|${ls.get('admin_token') ?? ''}|${path}`, options.ttl ?? DEFAULT_TTL_MS, () => request<T>(path));
}

// Toute écriture réussie vide le cache : les listes déjà consultées sont rechargées à la prochaine visite.
async function write<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const json = await request<T>(path, { method, body: body !== undefined ? JSON.stringify(body) : undefined });
  clearRequestCache();
  return json;
}

export const adminPost = <T = unknown>(path: string, body?: unknown) => write<T>('POST', path, body);
export const adminPatch = <T = unknown>(path: string, body?: unknown) => write<T>('PATCH', path, body);
export const adminDelete = <T = unknown>(path: string) => write<T>('DELETE', path);

export async function adminUploadImage(file: File): Promise<string> {
  const token = ls.get('admin_token');
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur upload');
  return json.url as string;
}

// Upload vidéo avec suivi de progression (XHR requis — fetch ne supporte pas onprogress)
export async function adminUploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const token = ls.get('admin_token');
    const formData = new FormData();
    formData.append('video', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/video');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.onload = () => {
      if (xhr.status === 401) { handle401(); reject(new Error('Non authentifié')); return; }
      try {
        const json = JSON.parse(xhr.responseText);
        if (!json.success) { reject(new Error(json.message || 'Erreur upload vidéo')); return; }
        resolve(json.url as string);
      } catch {
        reject(new Error('Réponse serveur invalide'));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau lors de l\'upload'));
    xhr.send(formData);
  });
}

// Suppression d'un fichier uploadé (nettoyage après remplacement) — fire and forget
export async function adminDeleteUpload(url: string): Promise<void> {
  if (!url || !url.startsWith('/uploads/')) return;
  const token = ls.get('admin_token');
  try {
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
    });
  } catch { /* non-critique */ }
}
