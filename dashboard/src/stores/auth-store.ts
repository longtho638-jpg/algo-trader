/**
 * Auth store — persisted login state for CashClaw.
 * Zustand + localStorage persist middleware.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  loggedIn: boolean;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  login: (email: string) => void;
  signup: (email: string, tier: 'free' | 'pro' | 'enterprise') => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      loggedIn: false,
      email: '',
      tier: 'free',
      login: (email) => set({ loggedIn: true, email }),
      signup: (email, tier) => set({ loggedIn: true, email, tier }),
      logout: () => set({ loggedIn: false, email: '', tier: 'free' }),
    }),
    { name: 'cashclaw-auth' }
  )
);
