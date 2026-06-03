// Service API admin — ajoute automatiquement le JWT et gère les 401
import { ls } from '@/lib/storage';

function headers(): HeadersInit {
  const token = ls.get('admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function handle401() {
  ls.remove('admin_token');
  ls.remove('admin_user');
  ls.remove('admin_logged_in');
  window.location.href = '/admin/login';
}

export async function adminGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: headers() });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur serveur');
  return json as T;
}

export async function adminPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur serveur');
  return json as T;
}

export async function adminPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'PATCH',
    headers: headers(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur serveur');
  return json as T;
}

export async function adminDelete<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { method: 'DELETE', headers: headers() });
  if (res.status === 401) { handle401(); throw new Error('Non authentifié'); }
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Erreur serveur');
  return json as T;
}

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
