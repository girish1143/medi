export default function FoundationPlaceholderPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Phase 1 — Project Foundation
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Healthcare Lead Generation Platform
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Initial frontend configuration is established. User interfaces and role-specific
          dashboards are intentionally deferred until Phase 2 authentication, consent, and core
          backend endpoints are implemented.
        </p>
      </div>
    </main>
  );
}
