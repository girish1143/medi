const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[] | undefined>;

  constructor(status: number, message: string, code = 'ERROR', details?: Record<string, string[] | undefined>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [field, messages] of Object.entries(this.details ?? {})) {
      if (messages?.length) result[field] = messages[0];
    }
    return result;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  formData?: FormData;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { method = 'GET', body, query, signal, formData } = options;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const url = `${API_URL}${path}${search.size ? `?${search.toString()}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      signal,
      headers: formData
        ? { Accept: 'application/json' }
        : {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Unable to reach the MediBook server. Check that the API is running.', 'NETWORK_ERROR');
  }

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) return apiRequest<T>(path, options, true);
  }

  let payload: ApiEnvelope<T> | null = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  }

  if (!response.ok) {
    const error = (payload ?? {}) as Partial<ApiEnvelope<T>> & {
      code?: string;
      details?: Record<string, string[] | undefined>;
    };
    throw new ApiError(
      response.status,
      error.message ?? 'Something went wrong. Please try again.',
      error.code ?? 'REQUEST_FAILED',
      error.details,
    );
  }

  if (!payload) {
    throw new ApiError(response.status, 'The server returned an unexpected response.', 'INVALID_RESPONSE');
  }

  return payload.data;
}

export async function apiMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta: Record<string, unknown> }> {
  const { method = 'GET', body, query, signal } = options;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const url = `${API_URL}${path}${search.size ? `?${search.toString()}` : ''}`;
  const response = await fetch(url, {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload) {
    throw new ApiError(
      response.status,
      payload?.message ?? 'Something went wrong. Please try again.',
      'REQUEST_FAILED',
    );
  }
  return { data: payload.data, meta: payload.meta ?? {} };
}

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  if (!response.ok) {
    throw new ApiError(response.status, 'Unable to download this document right now.', 'DOWNLOAD_FAILED');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export { API_URL };

export function toAbsoluteApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${new URL(API_URL).origin}${path}`;
}
