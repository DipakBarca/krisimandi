'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api';
import { useI18n } from './i18n';
import { Me } from './types';

type Auth = {
  me: Me | null;
  loading: boolean;
  /** Stores tokens from /auth/otp/verify and loads the profile. */
  signIn: (tokens: { accessToken: string; refreshToken: string }) => Promise<Me | null>;
  signOut: () => Promise<void>;
  reload: () => Promise<Me | null>;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  const reload = useCallback(async () => {
    if (!tokenStore.get()) {
      setMe(null);
      return null;
    }
    try {
      const user = await api<Me>('/me');
      setMe(user);
      return user;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const signIn = useCallback(
    async (tokens: { accessToken: string; refreshToken: string }) => {
      tokenStore.set(tokens);
      const user = await reload();
      if (user?.profileComplete) setLang(user.preferredLang);
      return user;
    },
    [reload, setLang],
  );

  const signOut = useCallback(async () => {
    const tokens = tokenStore.get();
    tokenStore.set(null);
    setMe(null);
    if (tokens) await api('/auth/logout', { body: { refreshToken: tokens.refreshToken } }).catch(() => {});
  }, []);

  return <AuthContext.Provider value={{ me, loading, signIn, signOut, reload }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
