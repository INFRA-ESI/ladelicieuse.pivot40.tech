/**
 * Service d'authentification JWT + 2FA OTP
 * Gère la connexion, la génération d'OTP et la validation des tokens
 */

import { ls } from '@/lib/storage';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OTPRequest {
  email: string;
  otp: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'manager' | 'staff';
  };
  error?: string;
}

export interface OTPResponse {
  success: boolean;
  message: string;
  otpSent?: boolean;
  expiresIn?: number;
  error?: string;
}

const API_BASE = '/api/auth';

/**
 * Envoie les identifiants et reçoit un OTP
 */
export const requestOTP = async (credentials: LoginRequest): Promise<OTPResponse> => {
  try {
    const response = await fetch(`${API_BASE}/request-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Erreur lors de la demande d\'OTP',
        error: data.error,
      };
    }

    return {
      success: true,
      message: 'OTP envoyé avec succès',
      otpSent: true,
      expiresIn: data.expiresIn || 300, // 5 minutes par défaut
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de connexion';
    return {
      success: false,
      message: 'Erreur lors de la demande d\'OTP',
      error: message,
    };
  }
};

async function postAuth(path: string, body: unknown): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return {
      success: response.ok && data?.success === true,
      message: data?.errors?.[0]?.message ?? data?.message ?? 'Erreur serveur. Réessayez.',
    };
  } catch {
    return { success: false, message: 'Impossible de joindre le serveur. Vérifiez votre connexion.' };
  }
}

/** Demande l'envoi d'un lien de réinitialisation du mot de passe administrateur */
export const requestAdminPasswordReset = (email: string) =>
  postAuth('forgot-password', { email });

/** Définit un nouveau mot de passe administrateur à partir du lien reçu par email */
export const resetAdminPassword = (token: string, password: string) =>
  postAuth('reset-password', { token, password });

/**
 * Valide l'OTP et retourne un JWT
 */
export const verifyOTP = async (otpRequest: OTPRequest): Promise<AuthResponse> => {
  try {
    const response = await fetch(`${API_BASE}/verify-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(otpRequest),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Erreur lors de la vérification de l\'OTP',
        error: data.error,
      };
    }

    // Stocker le token JWT via le wrapper sécurisé (Safari private mode safe)
    if (data.token) {
      ls.set('admin_token', data.token);
      ls.set('admin_user', JSON.stringify(data.user));
      ls.set('admin_logged_in', 'true');
    }

    return {
      success: true,
      message: 'Connexion réussie',
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de connexion';
    return {
      success: false,
      message: 'Erreur lors de la vérification de l\'OTP',
      error: message,
    };
  }
};

/**
 * Déconnexion — blackliste le token côté backend puis efface le stockage local
 */
export const logout = async (): Promise<void> => {
  const token = ls.get('admin_token');
  if (token) {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    } catch {
      // Échec réseau : on efface quand même le token local
    }
  }
  ls.remove('admin_token');
  ls.remove('admin_user');
  ls.remove('admin_logged_in');
};

/**
 * Récupère le token stocké
 */
export const getAuthToken = (): string | null => {
  return ls.get('admin_token');
};

/**
 * Récupère l'utilisateur stocké
 */
export const getAuthUser = () => {
  const user = ls.get('admin_user');
  try { return user ? JSON.parse(user) : null; } catch { return null; }
};

/**
 * Vérifie si l'utilisateur est authentifié
 */
export const isAuthenticated = (): boolean => {
  return !!getAuthToken() && !!getAuthUser();
};

/**
 * Renouvelle le token JWT
 */
export const refreshToken = async (): Promise<AuthResponse> => {
  try {
    const token = getAuthToken();
    if (!token) {
      return {
        success: false,
        message: 'Aucun token trouvé',
      };
    }

    const response = await fetch(`${API_BASE}/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      await logout();
      return {
        success: false,
        message: 'Token expiré',
        error: data.error,
      };
    }

    if (data.token) {
      ls.set('admin_token', data.token);
    }

    return {
      success: true,
      message: 'Token renouvelé',
      token: data.token,
      user: data.user,
    };
  } catch (error) {
    logout();
    const message = error instanceof Error ? error.message : 'Erreur de renouvellement';
    return {
      success: false,
      message: 'Erreur lors du renouvellement du token',
      error: message,
    };
  }
};
