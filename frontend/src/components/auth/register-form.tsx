'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser, useRegister } from '@/hooks/use-auth';
import { ROLE_HOME } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const phoneRegex = /^[6-9]\d{9}$/;

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(80, 'Name is too long'),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || phoneRegex.test(value.replace(/[\s()+-]/g, '').replace(/^91/, '')), {
        message: 'Enter a valid 10-digit Indian mobile number',
      }),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string(),
    terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue' }) }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const { data: currentUser } = useCurrentUser();
  const register = useRegister();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '', terms: false as unknown as true },
  });

  useEffect(() => {
    if (currentUser) router.replace(next || ROLE_HOME[currentUser.role] || '/');
  }, [currentUser, next, router]);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      const user = await register.mutateAsync({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success(`Welcome to MediBook, ${user.fullName.split(' ')[0]}`);
      router.replace(next || ROLE_HOME[user.role] || '/patient');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create your account');
    }
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Book verified doctors and keep your health records in one secure place.
        </p>
      </div>

      {formError && (
        <Alert variant="destructive" className="mb-5">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" placeholder="Priya Sharma" className="mt-2" {...form.register('fullName')} />
          {form.formState.errors.fullName && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.fullName.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" className="mt-2" {...form.register('email')} />
            {form.formState.errors.email && (
              <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="phone">
              Mobile <span className="font-normal text-slate-400">(optional)</span>
            </Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" className="mt-2" {...form.register('phone')} />
            {form.formState.errors.phone && (
              <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.phone.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
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
            <p className="mt-1.5 text-xs text-slate-400">Use at least 8 characters with a letter and a number.</p>
          )}
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className="mt-2"
            {...form.register('confirmPassword')}
          />
          {form.formState.errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.confirmPassword.message}</p>
          )}
        </div>

        <div>
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              {...form.register('terms')}
            />
            <span>
              I agree to the MediBook{' '}
              <Link href="/about" className="font-semibold text-blue-600 hover:text-blue-700">
                terms of service
              </Link>{' '}
              and privacy policy.
            </span>
          </label>
          {form.formState.errors.terms && (
            <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.terms.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          <UserPlus className="h-4 w-4" /> Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="font-semibold text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
