'use client';

const CSRF_COOKIE_NAME = 'hlp_csrf_token';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isMutatingMethod(method?: string): boolean {
  const upper = (method ?? 'GET').toUpperCase();
  return upper !== 'GET' && upper !== 'HEAD' && upper !== 'OPTIONS';
}

let pendingRefresh: Promise<boolean> | null = null;

async function attemptSessionRefresh(): Promise<boolean> {
  if (!pendingRefresh) {
    pendingRefresh = (async () => {
      try {
        const csrfToken = readCookie(CSRF_COOKIE_NAME);
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: {
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        pendingRefresh = null;
      }
    })();
  }
  return pendingRefresh;
}

/**
 * Centralized browser API client:
 * - Always sends credentials (`include`) so HTTP-only cookies travel cleanly.
 * - Attaches double-submit `x-csrf-token` on mutating requests.
 * - Transparently retries once after refresh-token rotation when receiving 401.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = () => {
    const headers = new Headers(init.headers);
    if (isMutatingMethod(init.method)) {
      const csrf = readCookie(CSRF_COOKIE_NAME);
      if (csrf && !headers.has('x-csrf-token')) {
        headers.set('x-csrf-token', csrf);
      }
    }
    return headers;
  };

  const requestInit: RequestInit = {
    ...init,
    credentials: 'include',
    headers: buildHeaders(),
  };

  const response = await fetch(input, requestInit);

  const urlStr = typeof input === 'string' ? input : input.toString();
  const isAuthEndpoint =
    urlStr.includes('/auth/login') ||
    urlStr.includes('/auth/refresh') ||
    urlStr.includes('/auth/logout');

  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await attemptSessionRefresh();
    if (refreshed) {
      return fetch(input, {
        ...init,
        credentials: 'include',
        headers: buildHeaders(),
      });
    }
  }

  return response;
}
