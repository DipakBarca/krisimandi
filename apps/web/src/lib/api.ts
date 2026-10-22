export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
  ) {
    super(message ?? code ?? `HTTP ${status}`);
  }
}

type Tokens = { accessToken: string; refreshToken: string };
const TOKENS_KEY = 'krisimandi.tokens';

export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(tokens: Tokens | null) {
    try {
      if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
      else localStorage.removeItem(TOKENS_KEY);
    } catch {}
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const tokens = tokenStore.get();
  if (!tokens) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        tokenStore.set(null);
        return false;
      }
      tokenStore.set(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Calls the API with the stored token, refreshing it once on a 401. Body may be JSON or FormData. */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const tokens = tokenStore.get();
  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}),
        ...(init.body && !isForm ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body ? (isForm ? (init.body as FormData) : JSON.stringify(init.body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  if (res.status === 401 && tokens && init.retry !== false && (await refreshTokens())) {
    return api<T>(path, { ...init, retry: false });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.code, Array.isArray(body.message) ? body.message.join(', ') : body.message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const photoUrl = (url: string) => (url.startsWith('http') ? url : `${API_URL}${url}`);
