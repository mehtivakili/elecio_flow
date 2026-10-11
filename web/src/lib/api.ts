const TOKEN_KEY = 'elecio_flow_token';

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable — session lives in memory only */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('elecio:logout'));
    }
    throw new ApiError(res.status, data.error || 'خطا در ارتباط با سرور', data.details);
  }
  return data as T;
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const put = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body: body ?? {} });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
