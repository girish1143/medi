import Link from 'next/link';
import { Compass } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <div className="max-w-md text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
            <Compass className="h-8 w-8" />
          </span>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">404</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            The page you are looking for does not exist or may have been moved.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/doctors">Find a doctor</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
