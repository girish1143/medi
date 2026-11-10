'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z
  .object({
    email: z.string().trim().email('Enter a valid email address'),
    token: z.string().trim().min(10, 'The reset token is missing or invalid'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: searchParams.get('email') ?? '',
      token: searchParams.get('token') ?? '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: { email: values.email, token: values.token, password: values.password },
      });
      toast.success('Password updated. Please sign in with your new password.');
      router.replace('/login');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to reset your password');
    }
  }

  return (
    <div>
      <div className="mb-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Set a new password</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Choose a strong password you haven&apos;t used before. You&apos;ll use it to sign in to MediBook.
        </p>
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {!searchParams.get('token') && (
        <Alert variant="warning" className="mb-5">
          <ShieldCheck />
          <AlertDescription>
            This page works with a secure link sent by email. If you opened it directly,{' '}
            <Link href="/forgot-password" className="font-semibold underline">
              request a new reset link
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" autoComplete="email" className="mt-2" {...form.register('email')} />
          {form.formState.errors.email && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="token">Reset token</Label>
          <Input id="token" className="mt-2 font-mono text-xs" placeholder="Paste the token from your email" {...form.register('token')} />
          {form.formState.errors.token && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.token.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="password">New password</Label>
          <div className="relative mt-2">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="pr-10"
              {...form.register('password')}
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
          {form.formState.errors.password ? (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.password.message}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">At least 8 characters with a letter and a number.</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            className="mt-2"
            {...form.register('confirmPassword')}
          />
          {form.formState.errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
