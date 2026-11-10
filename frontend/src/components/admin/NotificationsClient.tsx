'use client';

import { Bell, CheckCheck, Info, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModalDialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  EmptyState,
  ErrorBanner,
  Table,
  TableContainer,
  TableHead,
  TablePagination,
  TableSkeleton,
  Td,
  Th,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface NotificationRow {
  id: string;
  recipientUserId: string;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sentAt: string | null;
  readAt: string | null;
  failedReason: string | null;
  createdAt: string;
  recipient: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
}

interface RecipientOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export function NotificationsClient({
  currentUserId,
  canManage,
}: {
  currentUserId: string;
  canManage: boolean;
}) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [transportStatus, setTransportStatus] = useState({
    emailConfigured: false,
    smsConfigured: false,
    pushConfigured: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState('');
  const [channel, setChannel] = useState<'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH'>('IN_APP');
  const [templateKey, setTemplateKey] = useState('ADMIN_NOTICE');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        scope,
        page: String(page),
        pageSize: '15',
      });
      if (q.trim()) qs.set('q', q.trim());
      if (channelFilter) qs.set('channel', channelFilter);
      if (statusFilter) qs.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/notifications?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: {
          notifications: NotificationRow[];
          unreadCount: number;
          recipients: RecipientOption[];
          transportStatus: typeof transportStatus;
          pagination: { total: number };
        };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load notifications.');
      }
      setNotifications(json.data.notifications);
      setUnreadCount(json.data.unreadCount);
      setRecipients(json.data.recipients ?? []);
      if (json.data.transportStatus) {
        setTransportStatus(json.data.transportStatus);
      }
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [scope, page, q, channelFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function markOneRead(id: string) {
    setError(null);
    const res = await apiFetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      await loadData();
    }
  }

  async function markAllRead() {
    setError(null);
    const res = await apiFetch('/api/admin/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    if (res.ok) {
      await loadData();
    }
  }

  async function submitCreate() {
    setCreateError(null);
    if (!recipientUserId) {
      setCreateError('Select a recipient user.');
      return;
    }
    if (title.trim().length < 2 || body.trim().length < 2) {
      setCreateError('Title and body are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserId,
          channel,
          templateKey: templateKey.trim() || 'ADMIN_NOTICE',
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to queue notification.');
      }
      setCreateOpen(false);
      setTitle('');
      setBody('');
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Dispatch error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Notification Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Admin alerts, workflow updates, and outbound notification delivery log. Unread inbox alerts: {unreadCount}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 ? (
            <Button variant="outline" onClick={() => void markAllRead()}>
              <CheckCheck className="h-4 w-4" />
              Mark All Read
            </Button>
          ) : null}
          {canManage ? (
            <Button
              onClick={() => {
                setCreateError(null);
                setRecipientUserId(recipients[0]?.id ?? '');
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Notification
            </Button>
          ) : null}
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
        <span>
          <strong>Transport status:</strong> In-App notifications store and deliver directly in SQLite. External transports configured via environment: Email ({transportStatus.emailConfigured ? 'configured' : 'not configured — stored as QUEUED'}), SMS ({transportStatus.smsConfigured ? 'configured' : 'not configured — stored as QUEUED'}).
        </span>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {canManage ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={scope === 'mine' ? 'default' : 'outline'}
              onClick={() => {
                setScope('mine');
                setPage(1);
              }}
            >
              <Bell className="h-3.5 w-3.5" />
              My Inbox
            </Button>
            <Button
              size="sm"
              variant={scope === 'all' ? 'default' : 'outline'}
              onClick={() => {
                setScope('all');
                setPage(1);
              }}
            >
              Platform Dispatch Queue
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search title, body, template key, or recipient..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All channels</option>
            <option value="IN_APP">IN_APP</option>
            <option value="EMAIL">EMAIL</option>
            <option value="SMS">SMS</option>
            <option value="PUSH">PUSH</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="SENT">SENT</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="READ">READ</option>
            <option value="FAILED">FAILED</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications found"
          description={
            scope === 'mine'
              ? 'Your admin inbox is currently empty.'
              : 'No platform notifications match your filters.'
          }
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Notification</Th>
                <Th>Recipient</Th>
                <Th>Channel / Template</Th>
                <Th>Status</Th>
                <Th>Timestamp</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <tbody>
              {notifications.map((item) => {
                const isUnreadMine = item.recipientUserId === currentUserId && !item.readAt;
                return (
                  <tr
                    key={item.id}
                    className={
                      isUnreadMine
                        ? 'bg-teal-50/40 dark:bg-teal-950/20'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                    }
                  >
                    <Td>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.title}</div>
                      <div className="mt-0.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
                        {item.body}
                      </div>
                      {item.failedReason ? (
                        <div className="mt-1 text-xs text-rose-600">{item.failedReason}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="font-medium">{item.recipient.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {item.recipient.role} &bull; {item.recipient.email}
                      </div>
                    </Td>
                    <Td>
                      <Badge variant="outline">{item.channel}</Badge>
                      <div className="mt-1 font-mono text-[11px] text-slate-500">{item.templateKey}</div>
                    </Td>
                    <Td>
                      <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      <div>Created: {formatDateTime(item.createdAt)}</div>
                      {item.readAt ? <div>Read: {formatDateTime(item.readAt)}</div> : null}
                    </Td>
                    <Td className="text-right">
                      {isUnreadMine ? (
                        <Button size="sm" variant="outline" onClick={() => void markOneRead(item.id)}>
                          Mark Read
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
        </TableContainer>
      )}

      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Dispatch Notification"
        description="Send an in-app alert or queue an outbound notification record in SQLite."
      >
        <div className="space-y-3">
          <ErrorBanner message={createError} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Recipient User
            </label>
            <Select
              value={recipientUserId}
              onChange={(e) => setRecipientUserId(e.target.value)}
            >
              <option value="">Select user...</option>
              {recipients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role}) — {u.email}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Channel
              </label>
              <Select
                value={channel}
                onChange={(e) =>
                  setChannel(e.target.value as 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH')
                }
              >
                <option value="IN_APP">IN_APP (Immediate SQLite Inbox)</option>
                <option value="EMAIL">EMAIL (Queued unless SMTP configured)</option>
                <option value="SMS">SMS (Queued unless SMS webhook configured)</option>
                <option value="PUSH">PUSH</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Template Key
              </label>
              <Input
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                placeholder="ADMIN_NOTICE"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification subject"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Message Body
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write notification message..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={submitting}>
              {submitting ? 'Submitting...' : channel === 'IN_APP' ? 'Send Notification' : 'Queue Notification'}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
