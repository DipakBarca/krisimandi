'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { Crop, Municipality, Unit } from './types';

/** Fetches once on mount (and when the path changes). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e));
    return () => {
      live = false;
    };
  }, [path, version]);
  return { data, error, setData, refresh: () => setVersion((v) => v + 1) };
}

export const useCrops = () => useApi<Crop[]>('/crops').data ?? [];
export const useUnits = () => useApi<Unit[]>('/units').data ?? [];
export const useMunicipalities = () => useApi<Municipality[]>('/locations/municipalities').data ?? [];

/** Sends guests to /login and unfinished profiles to /onboarding. */
export function useRequireProfile() {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (!me.profileComplete) router.replace('/onboarding');
  }, [me, loading, router]);
  return loading || !me?.profileComplete ? null : me;
}
