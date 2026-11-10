import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-80 w-full" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
