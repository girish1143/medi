'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser, useLogin } from '@/hooks/use-auth';
import { ROLE_HOME } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { role: 'Patient', email: 'priya.sharma@example.com', password: 'Patient@12345' },
  { role: 'Doctor', email: 'arjun.mehta@medibook.in', password: 'Doctor@12345' },
  { role: 'Reception', email: 'reception@medibook.in', password: 'Reception@12345' },
  { role: 'Admin', email: 'admin@medibook.in', password: 'Admin@12345' },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const { data: currentUser } = useCurrentUser();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (currentUser) router.replace(next || ROLE_HOME[currentUser.role] || '/');
  }, [currentUser, next, router]);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const user = await login.mutateAsync(values);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}`);
      router.replace(next || ROLE_HOME[user.role] || '/');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in');
    }
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    form.setValue('email', account.email);
    form.setValue('password', account.password);
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-1.5 text-sm text-slate-500">Sign in to manage your appointments and health records.</p>
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2"
            {...form.register('email')}
            aria-invalid={Boolean(form.formState.errors.email)}
          />
          {form.formState.errors.email && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-blue-600 hover:text-blue-700">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-2">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="pr-10"
              {...form.register('password')}
              aria-invalid={Boolean(form.formState.errors.password)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          <LogIn className="h-4 w-4" /> Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        New to MediBook?{' '}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} className="font-semibold text-blue-600 hover:text-blue-700">
          Create a free account
        </Link>
      </p>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Protected by encrypted sessions and role-based access
      </p>

      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo environment</p>
          <p className="mt-1 text-xs text-slate-500">Use a demo account to explore each role.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                type="button"
                onClick={() => fillDemo(account)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-blue-300 hover:text-blue-600"
              >
                <span className="block font-semibold text-slate-800">{account.role}</span>
                <span className="block truncate text-[10px] text-slate-500">{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
