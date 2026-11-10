'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { NotificationItem, PaginationMeta } from '@/types';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatDateTime, relativeTime } from '@/lib/utils';

export function NotificationsView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['notifications', filter, page],
    queryFn: () =>
      apiMeta<NotificationItem[]>('/notifications', {
        query: { page, limit: 15, unread: filter === 'unread' ? 'true' : undefined },
      }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items = query.data?.data ?? [];
  const unread = Number(query.data?.meta.unread ?? 0);
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  return (
    <div>
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as 'all' | 'unread');
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread{unread ? ` (${unread})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          disabled={!unread}
          loading={markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck /> Mark all as read
        </Button>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load your notifications." onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <Card
                key={item.id}
                className={cn('p-4 transition sm:p-5', !item.readAt && 'border-blue-100 bg-blue-50/30')}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600')}>
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn('text-sm', item.readAt ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
                        {item.title}
                      </p>
                      {!item.readAt && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">New</span>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.body}</p>
                    <p className="mt-2 text-[11px] text-slate-400" title={formatDateTime(item.createdAt)}>
                      {relativeTime(item.createdAt)} · {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  {!item.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs text-blue-600"
                      loading={markRead.isPending && markRead.variables === item.id}
                      onClick={() => markRead.mutate(item.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={pagination?.page ?? page}
            totalPages={pagination?.totalPages ?? 1}
            total={pagination?.total}
            onPageChange={setPage}
          />
        </>
      ) : (
        <EmptyState
          icon={Bell}
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="Appointment updates, reminders and account messages will appear here."
        />
      )}
    </div>
  );
}
