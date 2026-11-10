import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">401 Unauthorized</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in required</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your session expired or you are not authenticated. Please sign in to continue.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
