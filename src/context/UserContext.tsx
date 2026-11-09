import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cachedJson } from '@/services/publicApiService';
import { loginClient, registerClient, fetchMe, getClientOrders, updateClientProfile, changePassword as apiChangePassword } from '@/services/clientService';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { ls } from '@/lib/storage';

export type LoyaltyTier = 'bronze' | 'argent' | 'or' | 'platine';

export interface TierDef {
  slug: string;
  nom: string;
  pointsMin: number;
  pointsMax: number | null;
  ordre: number;
}

export interface UserOrder {
  id: string;
  numero?: string;
  date: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  sousTotal?: number;
  fraisLivraison?: number;
  statut: 'en_attente' | 'confirmee' | 'en_preparation' | 'prete' | 'livree' | 'annulee' | 'remboursee';
  modePaiement: string;
  modeCommande?: string;
  pointsGagnes: number;
}

export interface Subscription {
  planId: 'essentiel' | 'vitalite' | 'premium';
  planName: string;
  billing: 'weekly' | 'monthly' | 'annual'; // 'annual' : abonnements historiques
  startDate: string;
  nextRenewal: string;
  status: 'active' | 'paused' | 'cancelled';
  price: number;
}

export interface User {
  id: string;
  nom: string;
  prenoms: string;
  telephone: string;
  email: string;
  points: number;
  commandes: UserOrder[];
  dateInscription: string;
  subscription?: Subscription;
}

const TIER_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  bronze:  { label: 'Bronze',  color: 'text-amber-700',  bg: 'bg-muted'  },
  argent:  { label: 'Argent',  color: 'text-slate-600',  bg: 'bg-muted'  },
  or:      { label: 'Or',      color: 'text-yellow-600', bg: 'bg-muted' },
  platine: { label: 'Platine', color: 'text-primary', bg: 'bg-primary/10' },
};

export function getTier(points: number, tiers?: TierDef[]): LoyaltyTier {
  if (tiers && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => b.pointsMin - a.pointsMin);
    const match = sorted.find(t => points >= t.pointsMin);
    return (match?.slug ?? 'bronze') as LoyaltyTier;
  }
  if (points >= 3500) return 'platine';
  if (points >= 1500) return 'or';
  if (points >= 500)  return 'argent';
  return 'bronze';
}

export type TierConfig = Record<string, { label: string; color: string; bg: string; min: number; next: number | null }>;

export function buildTierConfig(tiers: TierDef[]): TierConfig {
  const sorted = [...tiers].sort((a, b) => a.pointsMin - b.pointsMin);
  const config: TierConfig = {};
  sorted.forEach((t, i) => {
    const style = TIER_STYLE[t.slug] ?? { label: t.nom, color: 'text-gray-600', bg: 'bg-muted' };
    config[t.slug] = { ...style, min: t.pointsMin, next: sorted[i + 1]?.pointsMin ?? null };
  });
  return config;
}

export const TIER_CONFIG: TierConfig = {
  bronze:  { label: 'Bronze',  color: 'text-amber-700',  bg: 'bg-muted',  min: 0,    next: 500  },
  argent:  { label: 'Argent',  color: 'text-slate-600',  bg: 'bg-muted',  min: 500,  next: 1500 },
  or:      { label: 'Or',      color: 'text-yellow-600', bg: 'bg-muted', min: 1500, next: 3500 },
  platine: { label: 'Platine', color: 'text-primary', bg: 'bg-primary/10', min: 3500, next: null },
};

const STORAGE_KEY = 'ladelicieuse_user';
export const TOKEN_KEY = 'ladelicieuse_token';

export function loadStoredUser(): User | null {
  try {
    const raw = ls.get(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function saveUser(u: User | null) {
  if (u) ls.set(STORAGE_KEY, JSON.stringify(u));
  else ls.remove(STORAGE_KEY);
}

function saveToken(t: string | null) {
  if (t) ls.set(TOKEN_KEY, t);
  else ls.remove(TOKEN_KEY);
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  tiers: TierDef[];
  register: (nom: string, telephone: string, email: string) => User;
  login: (email: string) => User | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerAccount: (nom: string, prenoms: string, email: string, password: string, telephone?: string) => Promise<void>;
  logout: () => void;
  addOrder: (order: UserOrder) => void;
  subscribe: (sub: Subscription) => void;
  cancelSubscription: () => void;
  pauseSubscription: () => void;
  resumeSubscription: () => void;
  updateProfile: (data: { nom: string; prenoms: string; telephone: string; email: string }) => Promise<void>;
  refreshOrders: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);
  const [loading, setLoading] = useState<boolean>(false);
  const [tiers, setTiers] = useState<TierDef[]>([]);

  useEffect(() => {
    cachedJson('/api/fidelite/tiers/public')
      .then(d => { if (d.success && Array.isArray(d.data)) setTiers(d.data); })
      .catch(() => {});
  }, []);

  usePushNotifications(user?.id);

  const persist = (u: User | null) => { setUser(u); saveUser(u); };

  // Restaure la session réelle depuis le jeton stocké, au montage
  useEffect(() => {
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    setLoading(true);
    fetchMe(token)
      .then(apiUser => {
        const existing = loadStoredUser();
        const merged: User = {
          // /me renvoie `_id`, la connexion `id` : sans ce repli, `user.id` devenait indéfini après chaque rechargement
          // de la page (liste de commandes vide, push et temps réel désactivés).
          id: apiUser.id ?? apiUser._id ?? existing?.id ?? '',
          nom: apiUser.nom,
          prenoms: apiUser.prenoms || '',
          email: apiUser.email,
          telephone: apiUser.telephone || '',
          points: apiUser.points || 0,
          commandes: [], // toujours vide — MonComptePage charge depuis l'API
          dateInscription: existing?.dateInscription || new Date().toLocaleDateString('fr-FR'),
          subscription: existing?.subscription,
        };
        persist(merged);
      })
      .catch(() => {
        saveToken(null);
        persist(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const register = useCallback((nom: string, telephone: string, email: string): User => {
    const existing = loadStoredUser();
    if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
      const updated = { ...existing, nom, telephone };
      persist(updated);
      return updated;
    }
    const u: User = {
      id: crypto.randomUUID(),
      nom,
      prenoms: '',
      telephone,
      email,
      points: 0,
      commandes: [],
      dateInscription: new Date().toLocaleDateString('fr-FR'),
    };
    persist(u);
    return u;
  }, []);

  const login = useCallback((email: string): User | null => {
    const stored = loadStoredUser();
    if (stored && stored.email.toLowerCase() === email.toLowerCase()) {
      persist(stored);
      return stored;
    }
    return null;
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await loginClient(email, password);
    saveToken(res.token);
    const existing = loadStoredUser();
    const merged: User = {
      id: res.user.id,
      nom: res.user.nom,
      prenoms: res.user.prenoms || '',
      email: res.user.email,
      telephone: res.user.telephone || '',
      points: res.user.points || 0,
      commandes: [], // toujours vide — MonComptePage charge depuis l'API
      dateInscription: existing?.dateInscription || new Date().toLocaleDateString('fr-FR'),
      subscription: existing?.subscription,
    };
    persist(merged);
  }, []);

  const registerAccount = useCallback(async (nom: string, prenoms: string, email: string, password: string, telephone?: string): Promise<void> => {
    await registerClient({ nom, prenoms, email, password, telephone });
    // Registration successful — user must verify email before logging in
  }, []);

  const logout = useCallback(() => { saveToken(null); persist(null); }, []);

  const addOrder = useCallback((order: UserOrder) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated: User = {
        ...prev,
        commandes: [order, ...prev.commandes],
        points: prev.points + order.pointsGagnes,
      };
      saveUser(updated);
      return updated;
    });
  }, []);

  const subscribe = useCallback((sub: Subscription) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, subscription: sub };
      saveUser(updated);
      return updated;
    });
  }, []);

  const cancelSubscription = useCallback(() => {
    setUser(prev => {
      if (!prev?.subscription) return prev;
      const updated = { ...prev, subscription: { ...prev.subscription, status: 'cancelled' as const } };
      saveUser(updated);
      return updated;
    });
  }, []);

  const pauseSubscription = useCallback(() => {
    setUser(prev => {
      if (!prev?.subscription) return prev;
      const updated = { ...prev, subscription: { ...prev.subscription, status: 'paused' as const } };
      saveUser(updated);
      return updated;
    });
  }, []);

  const resumeSubscription = useCallback(() => {
    setUser(prev => {
      if (!prev?.subscription) return prev;
      const updated = { ...prev, subscription: { ...prev.subscription, status: 'active' as const } };
      saveUser(updated);
      return updated;
    });
  }, []);

  const updateProfile = useCallback(async (data: { nom: string; prenoms: string; telephone: string; email: string }): Promise<void> => {
    const token = ls.get(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié.');
    const apiUser = await updateClientProfile(token, data);
    setUser(prev => {
      if (!prev) return prev;
      const merged = { ...prev, nom: apiUser.nom, prenoms: apiUser.prenoms, telephone: apiUser.telephone, email: apiUser.email };
      saveUser(merged);
      return merged;
    });
  }, []);

  const refreshOrders = useCallback(async (): Promise<void> => {
    const token = ls.get(TOKEN_KEY);
    if (!token) return;
    const orders = await getClientOrders(token);
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, commandes: orders };
      saveUser(updated);
      return updated;
    });
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    const token = ls.get(TOKEN_KEY);
    if (!token) throw new Error('Non authentifié.');
    await apiChangePassword(token, currentPassword, newPassword);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, tiers, register, login, loginWithPassword, registerAccount, logout, addOrder, subscribe, cancelSubscription, pauseSubscription, resumeSubscription, updateProfile, refreshOrders, changePassword }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
