import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-slate-50 via-teal-50/30 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 text-slate-900">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              CareConnect Health Platform
            </span>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>
          </div>

          {children}
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-slate-600">{footer}</div> : null}
      </div>
    </div>
  );
}
