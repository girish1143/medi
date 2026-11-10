'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { NotificationItem } from '@/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function relativeTime(value: string): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(date);
}

export function NotificationBell({ href }: { href: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'preview'],
    queryFn: () => apiMeta<NotificationItem[]>('/notifications', { query: { limit: 5 } }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unread = Number(query.data?.meta.unread ?? 0);
  const items = query.data?.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500">{unread ? `${unread} unread` : 'You are all caught up'}</p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-blue-600"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Read all
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-80 overflow-y-auto">
          {query.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : items.length ? (
            items.map((item) => (
              <Link
                key={item.id}
                href={href}
                onClick={() => {
                  if (!item.readAt) markRead.mutate(item.id);
                }}
                className={cn(
                  'block border-b border-slate-50 px-4 py-3 transition last:border-0 hover:bg-slate-50',
                  !item.readAt && 'bg-blue-50/40',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      item.readAt ? 'bg-slate-200' : 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0">
                    <p className={cn('truncate text-sm', item.readAt ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.body}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">No notifications yet</p>
              <p className="mt-0.5 text-xs text-slate-400">Updates about your appointments will appear here.</p>
            </div>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <Link href={href} className="block px-4 py-2.5 text-center text-xs font-semibold text-blue-600 hover:bg-slate-50">
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
