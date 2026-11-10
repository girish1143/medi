import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
              Healthcare Lead Generation Platform
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Consent-First Patient & Provider Access Portal
            </h1>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
          Connect with verified doctors and hospitals through explicit patient consent controls,
          server-enforced role authorization, and immutable audit tracking.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
