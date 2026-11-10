'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ExternalLink, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser, useLogout, useRequireAuth } from '@/hooks/use-auth';
import { DASHBOARD_NAV, isNavActive, ROLE_BADGE } from '@/lib/dashboard-nav';
import { initials, ROLE_HOME, ROLE_LABELS } from '@/lib/utils';
import type { User, UserRole } from '@/types';
import { Logo } from '@/components/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationBell } from '@/components/dashboard/notification-bell';
import { cn } from '@/lib/utils';

function SidebarContent({
  user,
  pathname,
  onNavigate,
}: {
  user: User;
  pathname: string;
  onNavigate?: () => void;
}) {
  const nav = DASHBOARD_NAV[user.role] ?? [];
  const badge = ROLE_BADGE[user.role];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
        <Link href="/" className="inline-flex items-center gap-2.5" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <Avatar className="h-10 w-10">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
            <AvatarFallback className="bg-blue-100 text-sm font-semibold text-blue-700">
              {initials(user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{user.fullName}</p>
            <span
              className={cn(
                'mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Dashboard navigation">
        {nav.map((item) => {
          const active = isNavActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className={cn('h-5 w-5', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          <ExternalLink className="h-4 w-4" /> Back to website
        </Link>
        <div className="mt-1 flex items-center gap-2 rounded-lg bg-blue-50/70 px-3 py-2 text-[11px] leading-snug text-blue-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Your data is protected with role-based access.</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({
  roles,
  children,
  title,
}: {
  roles: UserRole[];
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading } = useRequireAuth(roles);
  const { data: cachedUser } = useCurrentUser();
  const logout = useLogout();
  const activeUser = user ?? cachedUser ?? null;
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  async function handleLogout() {
    await logout.mutateAsync().catch(() => undefined);
    toast.success('You have been signed out');
    router.push('/');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
          <p className="text-sm font-medium">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-slate-600">Please sign in to continue.</p>
          <Button asChild className="mt-4">
            <Link href={`/login?next=${encodeURIComponent(pathname)}`}>Go to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!roles.includes(activeUser.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <p className="text-sm font-medium text-slate-600">
            This area is not available for your role. Redirecting…
          </p>
          <Button asChild className="mt-4">
            <Link href={ROLE_HOME[activeUser.role] ?? '/'}>Go to my dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const notificationsHref = `${ROLE_HOME[activeUser.role] ?? ''}/notifications`;

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200/80 bg-white lg:block">
        <SidebarContent user={activeUser} pathname={pathname} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent user={activeUser} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{title ?? 'Dashboard'}</p>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {ROLE_LABELS[activeUser.role]} workspace · MediBook
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <NotificationBell href={notificationsHref} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 transition hover:border-slate-300 hover:shadow-sm">
                    <Avatar className="h-8 w-8">
                      {activeUser.avatarUrl ? <AvatarImage src={activeUser.avatarUrl} alt={activeUser.fullName} /> : null}
                      <AvatarFallback className="text-xs">{initials(activeUser.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[130px] truncate text-sm font-medium text-slate-700 sm:block">
                      {activeUser.fullName.split(' ')[0]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="normal-case tracking-normal">
                    <span className="block truncate text-sm font-semibold text-slate-800">{activeUser.fullName}</span>
                    <span className="block truncate text-xs font-normal text-slate-500">{activeUser.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={ROLE_HOME[activeUser.role] ?? '/'}>
                      <ShieldCheck /> My dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/">
                      <ExternalLink /> Visit MediBook
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-rose-600 focus:text-rose-700">
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
