'use client';

import Link from 'next/link';
import { Eye, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { VERIFICATION_STATUSES } from '@/lib/domain/enums';
import { apiFetch } from '@/services/api-client';

interface HospitalListRow {
  id: string;
  legalName: string;
  displayName: string;
  registrationNumber: string;
  verificationStatus: string;
  isAcceptingLeads: boolean;
  city: string;
  stateProvince: string;
  countryCode: string;
  _count: { departments: number; affiliatedDoctors: number; leadAssignments: number };
}

export function HospitalsClient() {
  const [hospitals, setHospitals] = useState<HospitalListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (status) qs.set('status', status);
      const res = await apiFetch(`/api/admin/hospitals?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: { hospitals: HospitalListRow[]; pagination: { total: number } };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load hospitals.');
        return;
      }
      setHospitals(json.data.hospitals);
      setTotal(json.data.pagination.total);
    } catch {
      setError('Unable to load hospital records.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Hospital Management
        </h1>
        <p className="text-xs text-slate-500">
          Review facility registrations, accreditation documents, departments, and affiliated doctors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by hospital name, registration number, or city..."
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
          <option value="">All Verification Statuses</option>
          {VERIFICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : hospitals.length === 0 ? (
        <EmptyState
          title="No hospitals registered"
          description="Healthcare facilities registering on the platform will appear here for review."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Hospital</Th>
                <Th>Registration</Th>
                <Th>Departments / Doctors</Th>
                <Th>Verification</Th>
                <Th>Assigned Leads</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <tbody>
              {hospitals.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <Td>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{h.displayName}</p>
                    <p className="text-xs text-slate-500">
                      {h.city}, {h.stateProvince} ({h.countryCode})
                    </p>
                  </Td>
                  <Td className="text-xs font-medium">{h.registrationNumber}</Td>
                  <Td className="text-xs">
                    {h._count.departments} depts · {h._count.affiliatedDoctors} doctors
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(h.verificationStatus)}>{h.verificationStatus}</Badge>
                  </Td>
                  <Td className="text-xs font-medium">{h._count.leadAssignments}</Td>
                  <Td className="text-right">
                    <Link href={`/admin/hospitals/${h.id}`}>
                      <Button variant="outline" size="sm">
                        <Eye className="h-3.5 w-3.5" />
                        Review
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
