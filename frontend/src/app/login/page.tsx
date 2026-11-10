'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { FormMessage } from '@/components/auth/FormMessage';
import { ROLE_HOME_ROUTES } from '@/lib/auth/roles';
import { authService } from '@/services/auth.service';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const user = await authService.login(email, password);

      if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
        router.push(callbackUrl);
        router.refresh();
        return;
      }

      const target = user.role in ROLE_HOME_ROUTES ? ROLE_HOME_ROUTES[user.role] : '/';
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid credentials, unverified email, inactive account, or temporary lockout.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to your account"
      subtitle="Access your patient, provider, or platform administration workspace."
      footer={
        <div className="space-y-1.5">
          <p>
            Need an account?{' '}
            <Link href="/register" className="font-medium text-teal-700 hover:text-teal-800">
              Create patient or provider account
            </Link>
          </p>
          <p>
            <Link href="/verify-email" className="text-slate-600 hover:text-slate-900">
              Have a verification token? Verify email
            </Link>
          </p>
        </div>
      }
    >
      <FormMessage type="error" message={error} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-xs focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            placeholder="name@organization.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1.5">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm text-slate-900 shadow-xs focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-0 right-2.5 flex items-center text-slate-500 hover:text-slate-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFormContent />
    </Suspense>
  );
}
