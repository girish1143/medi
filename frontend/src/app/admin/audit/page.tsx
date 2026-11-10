'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { apiMeta } from '@/lib/api';
import type { AuditLog, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, titleCase } from '@/lib/utils';

export default function AdminAuditPage() {
  const [action, setAction] = useState('');
  const [debouncedAction, setDebouncedAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [debouncedEntity, setDebouncedEntity] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAction(action);
      setDebouncedEntity(entityType);
    }, 300);
    return () => clearTimeout(timer);
  }, [action, entityType]);

  useEffect(() => {
    setPage(1);
  }, [debouncedAction, debouncedEntity]);

  const query = useQuery({
    queryKey: ['admin', 'audit', debouncedAction, debouncedEntity, page],
    queryFn: () =>
      apiMeta<AuditLog[]>('/admin/audit-logs', {
        query: {
          action: debouncedAction || undefined,
          entityType: debouncedEntity || undefined,
          page,
          limit: 20,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const logs = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = Boolean(debouncedAction || debouncedEntity);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="An append-only trail of privileged actions. Use it to investigate changes to users, doctors, payments and settings."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="Filter by action, e.g. admin.settings"
              className="pl-9"
              aria-label="Filter by action"
            />
          </div>
          <Input
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            placeholder="Entity type, e.g. doctor"
            aria-label="Filter by entity type"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load the audit log." onRetry={() => void query.refetch()} />
      ) : logs.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">{log.actorName ?? 'System'}</p>
                      <p className="text-[11px] capitalize text-slate-400">{log.actorRole ? titleCase(log.actorRole) : '—'}</p>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{log.action}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm capitalize text-slate-700">{log.entityType ? titleCase(log.entityType) : '—'}</p>
                      <p className="font-mono text-[11px] text-slate-400">{log.entityId ? `${log.entityId.slice(0, 8)}…` : ''}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{log.ipAddress ?? '—'}</TableCell>
                    <TableCell>
                      {Object.keys(log.metadata ?? {}).length ? (
                        <details className="max-w-[260px]">
                          <summary className="cursor-pointer text-xs font-medium text-blue-600">View</summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-950 p-2 text-[10px] leading-relaxed text-slate-100">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={pagination?.page ?? page} totalPages={pagination?.totalPages ?? 1} total={pagination?.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries"
          description={filtered ? 'No entry matches the selected filters.' : 'Privileged actions will be recorded here.'}
          action={filtered ? { label: 'Clear filters', onClick: () => { setAction(''); setEntityType(''); } } : undefined}
        />
      )}
    </div>
  );
}
