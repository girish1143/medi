import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Reset password' };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-56" /><Skeleton className="h-80 w-full" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
