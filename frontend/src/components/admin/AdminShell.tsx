'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileSearch,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { AdminNavItem } from '@/lib/auth/admin-nav';
import type { UserRole } from '@/lib/domain/enums';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';
import { authService } from '@/services/auth.service';

const ICONS = {
  dashboard: LayoutDashboard,
  users: Users,
  doctors: Stethoscope,
  hospitals: Building2,
  leads: Activity,
  subscriptions: PackageCheck,
  payments: CreditCard,
  analytics: BarChart3,
  notifications: Bell,
  support: Headphones,
  audit: FileSearch,
  settings: Settings,
} as const;

interface AdminShellProps {
  actor: {
    userId: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
  navItems: readonly AdminNavItem[];
  unreadNotificationsCount: number;
  children: ReactNode;
}

export function AdminShell({
  actor,
  navItems,
  unreadNotificationsCount,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; createdAt: string; readAt: string | null }>
  >([]);

  useEffect(() => {
    const saved = window.localStorage.getItem('healthcare-admin-theme');
    const isDark = saved === 'dark';
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    window.localStorage.setItem('healthcare-admin-theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  }

  async function toggleNotifications() {
    const next = !notifOpen;
    setNotifOpen(next);
    setProfileMenuOpen(false);
    if (next) {
      const res = await apiFetch('/api/admin/notifications?limit=5', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { notifications?: typeof notifications };
        };
        setNotifications(json.data?.notifications ?? []);
      }
    }
  }

  function handleQuickSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    router.push(`/admin/leads?q=${encodeURIComponent(trimmed)}`);
  }

  async function handleLogout() {
    await authService.logout();
    router.push('/login');
    router.refresh();
  }

  const segments = pathname.split('/').filter(Boolean);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 lg:static',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
          mobileOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            {!collapsed ? (
              <div className="truncate">
                <p className="text-sm font-semibold leading-none">CareConnect</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Admin Console</p>
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:inline-flex"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = ICONS[item.iconKey];
            const isActive =
              item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>Sign out</span> : null}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-xs sm:flex">
              {segments.map((seg, index) => {
                const href = '/' + segments.slice(0, index + 1).join('/');
                const isLast = index === segments.length - 1;
                return (
                  <span key={href} className="flex items-center gap-1.5">
                    {index > 0 ? <span className="text-slate-400">/</span> : null}
                    <Link
                      href={href}
                      className={cn(
                        'capitalize',
                        isLast
                          ? 'font-semibold text-slate-900 dark:text-slate-100'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
                      )}
                    >
                      {seg.replace('-', ' ')}
                    </Link>
                  </span>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <form onSubmit={handleQuickSearch} className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads by city or specialty..."
                className="w-60 rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </form>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
                className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationsCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-rose-600" />
                ) : null}
              </button>

              {notifOpen ? (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                    <span className="text-xs font-semibold">Notifications ({unreadNotificationsCount} unread)</span>
                    <Link
                      href="/admin/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      View all
                    </Link>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">No notifications yet.</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                          <p className="mt-0.5 text-slate-600 dark:text-slate-400">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(!profileMenuOpen);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-[11px] font-semibold text-white">
                  {actor.fullName.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden sm:block">
                  <span className="block font-medium text-slate-900 dark:text-slate-100">
                    {actor.fullName}
                  </span>
                  <span className="block text-[10px] text-slate-500">{actor.role}</span>
                </span>
              </button>

              {profileMenuOpen ? (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-200 px-2.5 py-2 text-xs dark:border-slate-800">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{actor.email}</p>
                    <p className="text-slate-500">{actor.role}</p>
                  </div>
                  <Link
                    href="/admin/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Platform Settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
