import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">403 Forbidden</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Insufficient privileges</h1>
        <p className="mt-2 text-sm text-slate-600">
          You do not have permission to view this resource. This access attempt has been logged.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}
