import { cookies } from 'next/headers';
import type { UserRole } from '@/lib/domain/enums';
import type { ApiResponseEnvelope } from '@/types/api.types';

const BACKEND_V1_URL =
  process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000/api/v1';

export interface ServerVerifiedActor {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  accountStatus: string;
  permissions: readonly string[];
}

export async function backendServerFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: { code: string; message: string } }> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const headers = new Headers(init.headers);
  if (cookieHeader && !headers.has('cookie')) {
    headers.set('cookie', cookieHeader);
  }

  try {
    const res = await fetch(`${BACKEND_V1_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });

    const json = (await res.json()) as ApiResponseEnvelope<T>;
    if (!res.ok || !json.success) {
      return {
        ok: false,
        status: res.status,
        error: json.error ?? { code: 'BACKEND_ERROR', message: 'Backend request failed.' },
      };
    }

    return { ok: true, status: res.status, data: json.data };
  } catch {
    return {
      ok: false,
      status: 503,
      error: { code: 'BACKEND_UNAVAILABLE', message: 'Backend API server is unreachable.' },
    };
  }
}

export async function getServerActor(): Promise<
  | { authenticated: true; actor: ServerVerifiedActor }
  | { authenticated: false; status: number }
> {
  const res = await backendServerFetch<{
    user: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      accountStatus: string;
    };
    permissions: string[];
  }>('/auth/me');

  if (!res.ok || !res.data?.user) {
    return { authenticated: false, status: res.status };
  }

  return {
    authenticated: true,
    actor: {
      userId: res.data.user.id,
      email: res.data.user.email,
      fullName: res.data.user.fullName,
      role: res.data.user.role,
      accountStatus: res.data.user.accountStatus,
      permissions: res.data.permissions ?? [],
    },
  };
}
