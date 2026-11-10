'use client';

import { FileSearch, Search, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ModalDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
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
import { AUDIT_OUTCOMES } from '@/lib/domain/enums';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  actor: { id: string; fullName: string; email: string; role: string } | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  requestId: string | null;
  hasIpHash: boolean;
  metadata: unknown;
  createdAt: string;
}

export function AuditLogsClient() {
  const [summary, setSummary] = useState({
    totalAll: 0,
    deniedCount: 0,
    failureCount: 0,
    authEventsCount: 0,
  });
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspected, setInspected] = useState<AuditLogRow | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (q.trim()) qs.set('q', q.trim());
      if (outcomeFilter) qs.set('outcome', outcomeFilter);
      if (resourceFilter) qs.set('resourceType', resourceFilter);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);

      const res = await apiFetch(`/api/admin/audit-logs?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: {
          summary: typeof summary;
          logs: AuditLogRow[];
          pagination: { total: number };
        };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load audit logs.');
      }
      setSummary(json.data.summary);
      setLogs(json.data.logs);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, q, outcomeFilter, resourceFilter, from, to]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Security &amp; Audit Logs
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Immutable security event trail across authentication, RBAC access checks, PHI disclosures, billing refunds, and settings changes.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Total Audit Events</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {summary.totalAll}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">RBAC / Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-bold text-rose-700 dark:text-rose-400">
            <ShieldAlert className="h-5 w-5" />
            {summary.deniedCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Failure Events</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {summary.failureCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Auth &amp; Identity Events</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-teal-700 dark:text-teal-400">
            {summary.authEventsCount}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search action, resource ID, or actor email..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={outcomeFilter}
          onChange={(e) => {
            setOutcomeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All outcomes</option>
          {AUDIT_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Select
          value={resourceFilter}
          onChange={(e) => {
            setResourceFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All resource types</option>
          <option value="User">User</option>
          <option value="Doctor">Doctor</option>
          <option value="Hospital">Hospital</option>
          <option value="Lead">Lead</option>
          <option value="Patient">Patient</option>
          <option value="Payment">Payment</option>
          <option value="SubscriptionPlan">SubscriptionPlan</option>
          <option value="SupportTicket">SupportTicket</option>
          <option value="AdminPermission">AdminPermission</option>
          <option value="PlatformSetting">PlatformSetting</option>
          <option value="AnalyticsExport">AnalyticsExport</option>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No audit events found"
          description="No audit trail entries match your active filters."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Timestamp</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Outcome</Th>
                <Th className="text-right">Details</Th>
              </tr>
            </TableHead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </Td>
                  <Td>
                    {log.actor ? (
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {log.actor.fullName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {log.actorRole ?? log.actor.role} &bull; {log.actor.email}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        {log.actorRole ?? 'SYSTEM / ANONYMOUS'}
                      </div>
                    )}
                  </Td>
                  <Td className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                    {log.action}
                  </Td>
                  <Td className="text-xs">
                    <div className="font-medium">{log.resourceType}</div>
                    {log.resourceId ? (
                      <div className="font-mono text-[11px] text-slate-400">{log.resourceId}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(log.outcome)}>{log.outcome}</Badge>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setInspected(log)}>
                      <FileSearch className="h-3.5 w-3.5" />
                      Inspect
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <TablePagination page={page} pageSize={20} total={total} onPageChange={setPage} />
        </TableContainer>
      )}

      <ModalDialog
        open={Boolean(inspected)}
        onClose={() => setInspected(null)}
        title={inspected ? `Audit Event: ${inspected.action}` : 'Audit Metadata'}
        description="Redacted audit metadata payload stored in SQLite."
      >
        {inspected ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <span className="text-slate-500">Outcome:</span>{' '}
                <strong>{inspected.outcome}</strong>
              </div>
              <div>
                <span className="text-slate-500">Timestamp:</span>{' '}
                <strong>{formatDateTime(inspected.createdAt)}</strong>
              </div>
              <div>
                <span className="text-slate-500">Resource:</span>{' '}
                <strong>{inspected.resourceType}</strong>
              </div>
              <div>
                <span className="text-slate-500">Resource ID:</span>{' '}
                <strong className="font-mono">{inspected.resourceId ?? '—'}</strong>
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">
                Sanitized Metadata JSON
              </div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] text-slate-100 dark:border-slate-800">
                {inspected.metadata ? JSON.stringify(inspected.metadata, null, 2) : 'null'}
              </pre>
            </div>
          </div>
        ) : null}
      </ModalDialog>
    </div>
  );
}
