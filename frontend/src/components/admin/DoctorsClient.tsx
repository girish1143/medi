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

interface DoctorListRow {
  id: string;
  medicalLicenseNumber: string;
  licensingAuthority: string;
  verificationStatus: string;
  isAcceptingLeads: boolean;
  city: string;
  stateProvince: string;
  countryCode: string;
  user: { fullName: string; email: string; accountStatus: string };
  specializations: Array<{ specializationCode: string; specializationName: string; isPrimary: boolean }>;
  _count: { leadAssignments: number };
}

export function DoctorsClient() {
  const [doctors, setDoctors] = useState<DoctorListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (status) qs.set('status', status);
      const res = await apiFetch(`/api/admin/doctors?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        success: boolean;
        data?: { doctors: DoctorListRow[]; pagination: { total: number } };
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Failed to load doctors.');
        return;
      }
      setDoctors(json.data.doctors);
      setTotal(json.data.pagination.total);
    } catch {
      setError('Unable to load doctor records.');
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Doctor Management</h1>
        <p className="text-xs text-slate-500">
          Inspect medical licenses, review credential documents, manage specializations, and verify doctors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by doctor name, email, license number, or city..."
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
      ) : doctors.length === 0 ? (
        <EmptyState
          title="No doctors registered"
          description="Registered doctors awaiting review or actively verified will appear here."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Doctor</Th>
                <Th>Registration</Th>
                <Th>Specializations</Th>
                <Th>Verification</Th>
                <Th>Assigned Leads</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <tbody>
              {doctors.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <Td>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{d.user.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {d.city}, {d.stateProvince} ({d.countryCode})
                    </p>
                  </Td>
                  <Td className="text-xs">
                    <p className="font-medium">{d.medicalLicenseNumber}</p>
                    <p className="text-slate-500">{d.licensingAuthority}</p>
                  </Td>
                  <Td className="text-xs">
                    {d.specializations.map((s) => s.specializationName).join(', ') || '—'}
                  </Td>
                  <Td>
                    <Badge variant={statusBadgeVariant(d.verificationStatus)}>{d.verificationStatus}</Badge>
                  </Td>
                  <Td className="text-xs font-medium">{d._count.leadAssignments}</Td>
                  <Td className="text-right">
                    <Link href={`/admin/doctors/${d.id}`}>
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
