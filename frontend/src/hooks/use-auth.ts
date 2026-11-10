'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '@/lib/api';
import { ROLE_HOME } from '@/lib/utils';
import type { User, UserRole } from '@/types';

export function useCurrentUser() {
  return useQuery<User | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await apiRequest<User>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiRequest<User>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (user) => {
      queryClient.setQueryData(['auth', 'me'], user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      fullName: string;
      email: string;
      phone?: string;
      password: string;
      confirmPassword?: string;
    }) => {
      const { confirmPassword: _confirmPassword, ...body } = input;
      return apiRequest<User>('/auth/register', { method: 'POST', body });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['auth', 'me'], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<null>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}

export function useRequireAuth(roles?: UserRole[]) {
  const query = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (query.isLoading) return;
    if (!query.data) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    if (roles && !roles.includes(query.data.role)) {
      router.replace(ROLE_HOME[query.data.role] ?? '/');
    }
  }, [query.isLoading, query.data, roles, router, pathname]);

  return query;
}
