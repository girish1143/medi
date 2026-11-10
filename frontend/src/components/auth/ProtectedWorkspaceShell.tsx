import { redirect } from 'next/navigation';
import { getServerActor } from '@/lib/auth/server-api';
import type { UserRole } from '@/lib/domain/enums';
import { SignOutButton } from './SignOutButton';

interface ProtectedWorkspaceShellProps {
  title: string;
  description: string;
  allowedRoles: readonly UserRole[];
}

export async function ProtectedWorkspaceShell({
  title,
  description,
  allowedRoles,
}: ProtectedWorkspaceShellProps) {
  const session = await getServerActor();
  if (!session.authenticated) {
    redirect('/login');
  }

  const { actor } = session;
  if (!allowedRoles.includes(actor.role)) {
    redirect('/access-denied');
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <span className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              {actor.role}
            </span>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
          <SignOutButton />
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Verified Email
            </dt>
            <dd className="mt-1 font-medium text-slate-900">{actor.email}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Account Status
            </dt>
            <dd className="mt-1 font-medium text-emerald-700">{actor.accountStatus}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Session Verification
            </dt>
            <dd className="mt-1 font-medium text-slate-900">Verified via Express API</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
