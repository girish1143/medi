import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';

export default function AccessDeniedPage() {
  return (
    <AuthShell
      title="Access denied"
      subtitle="Your account role or current permissions do not authorize access to this workspace."
    >
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm text-slate-600">
          If you believe this restriction is unexpected, contact your platform administrator or sign
          in with an authorized account.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Return home
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Switch account
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
