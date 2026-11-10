'use client';

import Link from 'next/link';
import { Headphones, Lock, MessageSquarePlus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface AdminUserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface TicketRow {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  resolutionNotes: string | null;
  createdAt: string;
  requester: { id: string; fullName: string; email: string; role: string };
  assignedAdmin: AdminUserOption | null;
  lead: { id: string; specialization: string; status: string } | null;
  _count: { replies: number };
}

interface TicketReply {
  id: string;
  isInternalNote: boolean;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; email: string; role: string };
}

interface TicketDetail extends Omit<TicketRow, '_count'> {
  replies: TicketReply[];
}

export function SupportClient() {
  const [summary, setSummary] = useState({
    openCount: 0,
    inProgressCount: 0,
    criticalOpenCount: 0,
    resolvedCount: 0,
  });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [admins, setAdmins] = useState<AdminUserOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editResolutionNotes, setEditResolutionNotes] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter) qs.set('status', statusFilter);
      if (priorityFilter) qs.set('priority', priorityFilter);
      if (assignedFilter) qs.set('assignedAdminUserId', assignedFilter);

      const res = await apiFetch(`/api/admin/support?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: {
          summary: typeof summary;
          tickets: TicketRow[];
          admins: AdminUserOption[];
          pagination: { total: number };
        };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load support tickets.');
      }
      setSummary(json.data.summary);
      setTickets(json.data.tickets);
      setAdmins(json.data.admins);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, priorityFilter, assignedFilter]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  async function openTicket(ticketId: string) {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/api/admin/support/${ticketId}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: { ticket: TicketDetail };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load ticket details.');
      }
      const t = json.data.ticket;
      setDetail(t);
      setEditStatus(t.status);
      setEditPriority(t.priority);
      setEditAssignee(t.assignedAdmin?.id ?? '');
      setEditResolutionNotes(t.resolutionNotes ?? '');
      setReplyBody('');
      setIsInternalNote(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open ticket.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveTicketChanges() {
    if (!detail) return;
    setSaving(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/api/admin/support/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          priority: editPriority,
          assignedAdminUserId: editAssignee || null,
          resolutionNotes: editResolutionNotes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to update ticket.');
      }
      await Promise.all([openTicket(detail.id), loadTickets()]);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Unable to update ticket.');
    } finally {
      setSaving(false);
    }
  }

  async function submitReply() {
    if (!detail) return;
    if (replyBody.trim().length < 2) {
      setDetailError('Reply text must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/api/admin/support/${detail.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: replyBody.trim(),
          isInternalNote,
          nextStatus: editStatus !== detail.status ? editStatus : undefined,
        }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to submit reply.');
      }
      await Promise.all([openTicket(detail.id), loadTickets()]);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Reply submission failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Support Tickets &amp; Escalations
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Triage patient and provider support requests, assign admin owners, and track audited resolutions.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Open Tickets</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-teal-700 dark:text-teal-400">
            {summary.openCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">In Progress</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {summary.inProgressCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Critical Unresolved</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-rose-700 dark:text-rose-400">
            {summary.criticalOpenCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Resolved / Closed</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {summary.resolvedCount}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search ticket #, subject, requester name or email..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="WAITING_ON_USER">WAITING_ON_USER</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </Select>
        <Select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All priorities</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </Select>
        <Select
          value={assignedFilter}
          onChange={(e) => {
            setAssignedFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All assignees</option>
          <option value="unassigned">Unassigned only</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No support tickets found"
          description="No support tickets exist in SQLite or match your active filters."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Ticket</Th>
                <Th>Requester</Th>
                <Th>Priority / Category</Th>
                <Th>Status</Th>
                <Th>Assigned Admin</Th>
                <Th>Created</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <Td>
                    <div className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                      {ticket.ticketNumber}
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{ticket.subject}</div>
                    <div className="text-xs text-slate-500">{ticket._count.replies} replies</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{ticket.requester.fullName}</div>
                    <div className="text-xs text-slate-500">
                      {ticket.requester.role} &bull; {ticket.requester.email}
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        ticket.priority === 'CRITICAL' || ticket.priority === 'HIGH'
                          ? 'danger'
                          : ticket.priority === 'MEDIUM'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {ticket.priority}
                    </Badge>
                    <div className="mt-1 text-xs text-slate-500">{ticket.category}</div>
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(ticket.status)}>{ticket.status}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {ticket.assignedAdmin ? (
                      <div>
                        <div className="font-medium">{ticket.assignedAdmin.fullName}</div>
                        <div className="text-slate-500">{ticket.assignedAdmin.role}</div>
                      </div>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">Unassigned</span>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(ticket.createdAt)}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void openTicket(ticket.id)}
                      disabled={detailLoading}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      Manage
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
        </TableContainer>
      )}

      <ModalDialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.ticketNumber}: ${detail.subject}` : 'Ticket Details'}
        description={
          detail
            ? `Requester: ${detail.requester.fullName} (${detail.requester.email})`
            : undefined
        }
      >
        {detail ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <ErrorBanner message={detailError} />

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200">
              <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
                Original Description ({detail.category})
              </div>
              <p className="whitespace-pre-wrap">{detail.description}</p>
              {detail.lead ? (
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  Linked Lead:{' '}
                  <Link
                    href={`/admin/leads/${detail.lead.id}`}
                    className="font-medium text-teal-700 underline dark:text-teal-400"
                  >
                    {detail.lead.specialization} ({detail.lead.status})
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Status</label>
                <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="WAITING_ON_USER">WAITING_ON_USER</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Priority</label>
                <Select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Assign Admin</label>
                <Select value={editAssignee} onChange={(e) => setEditAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Resolution Notes</label>
              <Input
                value={editResolutionNotes}
                onChange={(e) => setEditResolutionNotes(e.target.value)}
                placeholder="Summary of resolution for audit record..."
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => void saveTicketChanges()} disabled={saving}>
                Save Status &amp; Assignment
              </Button>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conversation &amp; Internal Notes ({detail.replies.length})
              </div>
              {detail.replies.length === 0 ? (
                <p className="text-xs text-slate-500">No replies recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className={`rounded-lg border p-2.5 text-xs ${
                        reply.isInternalNote
                          ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 font-medium">
                        <span className="flex items-center gap-1.5">
                          {reply.isInternalNote ? <Lock className="h-3 w-3 text-amber-700" /> : null}
                          {reply.sender.fullName} ({reply.sender.role})
                          {reply.isInternalNote ? (
                            <Badge variant="warning">Internal Note</Badge>
                          ) : null}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDateTime(reply.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                        {reply.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <label className="block text-xs font-medium">Add Reply or Internal Note</label>
              <Textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a response to the user or an internal triage note..."
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
                  Internal admin note only (do not notify requester)
                </label>
                <Button size="sm" onClick={() => void submitReply()} disabled={saving}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  {isInternalNote ? 'Add Internal Note' : 'Send Reply'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
