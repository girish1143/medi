'use client';

import type { UserRole } from '@/lib/domain/enums';
import type { ApiResponseEnvelope, AuthenticatedActorProfile } from '@/types/api.types';
import { apiFetch } from './api-client';

export const authService = {
  async login(email: string, password: string) {
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json()) as ApiResponseEnvelope<{
      user: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
        accountStatus: string;
      };
    }>;
    if (!res.ok || !json.data) {
      throw new Error(json.error?.message ?? 'Invalid credentials or inactive account.');
    }
    return json.data.user;
  },

  async logout(): Promise<void> {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
  },

  async getMe(): Promise<{ user: AuthenticatedActorProfile; permissions: string[] } | null> {
    const res = await apiFetch('/api/v1/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResponseEnvelope<{
      user: AuthenticatedActorProfile;
      permissions: string[];
    }>;
    return json.data ?? null;
  },

  async registerPatient(payload: Record<string, unknown>) {
    const res = await apiFetch('/api/v1/auth/register/patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  },

  async registerDoctor(payload: Record<string, unknown>) {
    const res = await apiFetch('/api/v1/auth/register/doctor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  },

  async registerHospital(payload: Record<string, unknown>) {
    const res = await apiFetch('/api/v1/auth/register/hospital', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res;
  },
};
