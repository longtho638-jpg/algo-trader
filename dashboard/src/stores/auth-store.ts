/**
 * Auth store — persisted login state for CashClaw.
 * Zustand + localStorage persist middleware.
 * Supports real API calls with fallback to local state.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

interface AuthState {
  loggedIn: boolean;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  token: string | null;
  tenantId: string | null;
  apiKey: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, tier: 'free' | 'pro' | 'enterprise') => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      email: '',
      tier: 'free',
      token: null,
      tenantId: null,
      apiKey: null,
      loading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) {
            const data = await res.json() as {
              token: string; tenantId: string; email: string; tier: string;
            };
            set({
              loggedIn: true,
              token: data.token,
              tenantId: data.tenantId,
              email: data.email,
              tier: (data.tier as 'free' | 'pro' | 'enterprise') ?? 'free',
              loading: false,
            });
            return;
          }
          const err = await res.json().catch(() => ({ error: 'Login failed' })) as { error?: string };
          // API available but credentials wrong — don't fallback
          if (res.status === 401) {
            set({ loading: false, error: err.error ?? 'Invalid credentials' });
            return;
          }
        } catch {
          // API unavailable — fallback to local
        }
        // Local fallback
        set({
          loggedIn: true,
          email,
          tier: 'free',
          token: null,
          tenantId: `local_${email}`,
          loading: false,
        });
      },

      signup: async (email: string, password: string, tier: 'free' | 'pro' | 'enterprise') => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, tier }),
          });
          if (res.ok) {
            const data = await res.json() as {
              token: string; tenantId: string; email: string; tier: string; apiKey: string;
            };
            set({
              loggedIn: true,
              token: data.token,
              tenantId: data.tenantId,
              email: data.email,
              tier: (data.tier as 'free' | 'pro' | 'enterprise') ?? tier,
              apiKey: data.apiKey,
              loading: false,
            });
            return;
          }
          const err = await res.json().catch(() => ({ error: 'Signup failed' })) as { error?: string };
          if (res.status === 409) {
            set({ loading: false, error: err.error ?? 'Email already registered' });
            return;
          }
          if (res.status === 400) {
            set({ loading: false, error: err.error ?? 'Invalid input' });
            return;
          }
        } catch {
          // API unavailable — fallback to local
        }
        // Local fallback
        set({
          loggedIn: true,
          email,
          tier,
          token: null,
          tenantId: `local_${email}`,
          apiKey: null,
          loading: false,
        });
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json() as {
              tenantId: string; email: string; tier: string; scopes: string[];
            };
            set({
              tenantId: data.tenantId,
              email: data.email,
              tier: (data.tier as 'free' | 'pro' | 'enterprise') ?? 'free',
            });
          }
        } catch {
          // silently ignore
        }
      },

      logout: () =>
        set({ loggedIn: false, email: '', tier: 'free', token: null, tenantId: null, apiKey: null, error: null }),
    }),
    { name: 'cashclaw-auth' }
  )
);
