'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { FormMessage } from '@/components/auth/FormMessage';
import { apiFetch } from '@/services/api-client';

function ResetPasswordFormContent() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password, confirmPassword }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? 'Password reset failed.');
        return;
      }
      setSuccess(
        payload.data?.message ??
          'Password updated successfully. All active sessions have been revoked.',
      );
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Unable to reset password right now.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Set a new strong passphrase. All active sessions will be logged out."
      footer={
        <p>
          <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
            Proceed to sign in
          </Link>
        </p>
      }
    >
      <FormMessage type="error" message={error} />
      <FormMessage type="success" message={success} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="token" className="block text-sm font-medium text-slate-700">
            Reset token
          </label>
          <input
            id="token"
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? 'Updating password...' : 'Reset password'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordFormContent />
    </Suspense>
  );
}
