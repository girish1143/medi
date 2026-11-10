'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const result = await apiRequest<{ devResetUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: values,
      });
      setDevResetUrl(result?.devResetUrl ?? null);
      setSent(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to send the reset link');
    }
  }

  if (sent) {
    return (
      <div>
        <div className="mb-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Mail className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Check your email</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            If an account exists for <strong className="font-semibold text-slate-700">{form.getValues('email')}</strong>,
            we have sent a secure link to reset your password. It expires in 30 minutes.
          </p>
        </div>

        <Alert variant="success" className="mb-5">
          <CheckCircle2 />
          <AlertTitle>Reset link sent</AlertTitle>
          <AlertDescription>
            Didn&apos;t receive it? Check your spam folder or try again in a few minutes.
          </AlertDescription>
        </Alert>

        {devResetUrl && (
          <Alert className="mb-5">
            <AlertTitle>Development mode</AlertTitle>
            <AlertDescription>
              <p className="mb-2">Email delivery is simulated locally. Use this direct reset link:</p>
              <Link href={devResetUrl} className="break-all font-semibold text-blue-700 underline">
                Open password reset link
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <Button asChild size="lg" className="w-full">
            <Link href={devResetUrl ?? '/login'}>
              {devResetUrl ? 'Continue to reset password' : 'Back to sign in'}
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setSent(false);
              setDevResetUrl(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <Link href="/login" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Enter the email address linked to your MediBook account and we&apos;ll send you a secure reset link.
        </p>
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
        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          <Mail className="h-4 w-4" /> Send reset link
        </Button>
      </form>

      <p className="mt-6 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        For your safety we never reveal whether an email is registered. Password reset links are single-use and expire
        after 30 minutes.
      </p>
    </div>
  );
}
