'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { FormMessage } from '@/components/auth/FormMessage';
import { apiFetch } from '@/services/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const response = await apiFetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success) {
        setError(payload.error?.message ?? 'Unable to process password reset request.');
        return;
      }
      setSuccess(
        payload.data?.message ??
          'If an eligible account matches that email, reset instructions have been issued.',
      );
    } catch {
      setError('Unable to reach authentication service.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your registered email address to receive a time-limited password reset token."
      footer={
        <p>
          Remembered your password?{' '}
          <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
            Back to sign in
          </Link>
        </p>
      }
    >
      <FormMessage type="error" message={error} />
      <FormMessage type="success" message={success} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? 'Submitting...' : 'Send reset instructions'}
        </button>
      </form>
    </AuthShell>
  );
}
