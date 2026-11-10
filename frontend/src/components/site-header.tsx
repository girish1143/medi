'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronDown, LayoutDashboard, LogOut, Menu, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { initials, ROLE_HOME, ROLE_LABELS } from '@/lib/utils';

const NAV = [
  { href: '/doctors', label: 'Find doctors' },
  { href: '/specialties', label: 'Specialties' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { data: user, isLoading } = useCurrentUser();
  const logout = useLogout();
  const router = useRouter();
  const home = user ? ROLE_HOME[user.role] : '/login';
  const notificationsHref = user
    ? user.role === 'patient'
      ? '/patient/notifications'
      : user.role === 'doctor'
        ? '/doctor/notifications'
        : user.role === 'admin'
          ? '/admin'
          : '/reception/notifications'
    : '/login';

  async function handleLogout() {
    await logout.mutateAsync().catch(() => undefined);
    toast.success('You have been signed out');
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-lg">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {isLoading ? (
            <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-100" />
          ) : user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="gap-2 text-slate-600">
                <Link href={notificationsHref}>
                  <CalendarDays className="h-4 w-4" />
                  {ROLE_LABELS[user.role]}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:border-slate-300 hover:shadow-sm">
                    <Avatar className="h-8 w-8">
                      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.fullName} /> : null}
                      <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-[120px] truncate text-sm font-medium text-slate-700">{user.fullName}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="normal-case tracking-normal text-slate-500">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={home}>
                      <LayoutDashboard /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  {user.role === 'patient' && (
                    <DropdownMenuItem asChild>
                      <Link href="/patient/profile">
                        <UserRound /> My profile
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-rose-600 focus:text-rose-700">
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg px-4">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 md:hidden"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-white px-4 pb-5 pt-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
            {user ? (
              <>
                <Button asChild className="w-full">
                  <Link href={home} onClick={() => setOpen(false)}>
                    Go to dashboard
                  </Link>
                </Button>
                <Button variant="outline" className="w-full" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="w-full">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/register" onClick={() => setOpen(false)}>
                    Create account
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
