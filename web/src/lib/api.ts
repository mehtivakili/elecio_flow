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

/** Authenticated file download (backups): fetches as a blob and hands it to the browser. */
export async function downloadFile(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'دریافت فایل ناموفق بود');
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Authenticated raw upload (database import). */
export async function uploadFile<T = any>(path: string, file: File): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'ارسال فایل ناموفق بود');
  return data as T;
}

/** Authenticated binary GET (documents, invoices) — the caller makes object URLs as needed. */
export async function fetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'دریافت فایل ناموفق بود');
  }
  return res.blob();
}

/** Uploads one document (image / PDF); its details travel in a header so the body stays the raw file. */
export async function uploadAttachment<T = any>(file: Blob, meta: Record<string, unknown>): Promise<T> {
  const token = getToken();
  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Attachment-Meta': encodeURIComponent(JSON.stringify(meta)),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, res.status === 413 ? 'حجم فایل بیش از ۲۰ مگابایت است' : data.error || 'ارسال فایل ناموفق بود');
  return data as T;
}
