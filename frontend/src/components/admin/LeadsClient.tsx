'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, Search } from 'lucide-react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { LEAD_PRIORITIES, LEAD_SOURCES, LEAD_STATUSES } from '@/lib/domain/enums';
import { formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface LeadRow {
  id: string;
  patientRef: string;
  specialization: string;
  location: string;
  enquiryDescription: string;
  leadSource: string;
  status: string;
  priority: string;
  assignedProvider: string | null;
  createdAt: string;
}

function LeadsClientInner() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (status) qs.set('status', status);
      if (priority) qs.set('priority', priority);
      if (source) qs.set('source', source);

      const res = await apiFetch(`/api/admin/leads?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: { leads: LeadRow[]; pagination: { total: number } };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load leads.');
        return;
      }
      setLeads(json.data.leads);
      setTotal(json.data.pagination.total);
    } catch {
      setError('Unable to reach leads API.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status, priority, source]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Lead Management CRM
        </h1>
        <p className="text-xs text-slate-500">
          Patient contact details remain masked unless explicit active disclosure consent is verified.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search ID, specialty, city, or enquiry..."
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={priority}
          onChange={(e) => {
            setPage(1);
            setPriority(e.target.value);
          }}
        >
          <option value="">All Priorities</option>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          value={source}
          onChange={(e) => {
            setPage(1);
            setSource(e.target.value);
          }}
        >
          <option value="">All Sources</option>
          {LEAD_SOURCES.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </Select>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads found"
          description="Healthcare enquiries submitted by patients will appear here."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Lead / Patient Ref</Th>
                <Th>Specialization & Location</Th>
                <Th>Enquiry</Th>
                <Th>Source</Th>
                <Th>Status</Th>
                <Th>Assigned Provider</Th>
                <Th>Created</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <Td className="text-xs">
                    <p className="font-mono font-medium">{l.id.slice(0, 8)}</p>
                    <p className="text-slate-500">{l.patientRef}</p>
                  </Td>
                  <Td className="text-xs">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {l.specialization}
                    </p>
                    <p className="text-slate-500">{l.location}</p>
                  </Td>
                  <Td className="max-w-xs truncate text-xs">{l.enquiryDescription}</Td>
                  <Td className="text-xs">{l.leadSource}</Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(l.status)}>{l.status}</Badge>
                  </Td>
                  <Td className="text-xs">{l.assignedProvider ?? 'Unassigned'}</Td>
                  <Td className="text-xs">{formatDateTime(l.createdAt)}</Td>
                  <Td className="text-right">
                    <Link href={`/admin/leads/${l.id}`}>
                      <Button variant="outline" size="sm">
                        <Eye className="h-3.5 w-3.5" />
                        Manage
                      </Button>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
        </TableContainer>
      )}
    </div>
  );
}

export function LeadsClient() {
  return (
    <Suspense>
      <LeadsClientInner />
    </Suspense>
  );
}
