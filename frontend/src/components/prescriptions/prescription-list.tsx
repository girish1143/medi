'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, Pill, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, downloadFile } from '@/lib/api';
import type { PaginationMeta, Prescription } from '@/types';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';

export function PrescriptionList({
  basePath,
  heading = 'Prescriptions',
  description = 'Digital prescriptions issued after your consultations.',
}: {
  basePath: string;
  heading?: string;
  description?: string;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const query = useQuery({
    queryKey: ['prescriptions', basePath, debounced, page],
    queryFn: () => apiMeta<Prescription[]>('/prescriptions', { query: { page, limit: 10 } }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = debounced
    ? items.filter((item) => {
        const haystack = `${item.prescriptionNumber} ${item.diagnosis} ${item.doctor.name} ${item.patient.name}`.toLowerCase();
        return haystack.includes(debounced.toLowerCase());
      })
    : items;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search prescriptions"
            className="pl-9 sm:w-64"
            aria-label="Search prescriptions"
          />
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load prescriptions." onRetry={() => void query.refetch()} />
      ) : filtered.length ? (
        <>
          <div className="space-y-3">
            {filtered.map((prescription) => (
              <Card key={prescription.id} className="p-4 transition hover:border-blue-200 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={`${basePath}/${prescription.id}`} className="flex min-w-0 items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <Pill className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{prescription.diagnosis}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Dr. {prescription.doctor.name} · {formatDate(prescription.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {prescription.prescriptionNumber} · {prescription.items.length} medicine
                        {prescription.items.length === 1 ? '' : 's'}
                        {prescription.followUpDate ? ` · Follow-up ${formatDate(prescription.followUpDate)}` : ''}
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void downloadFile(
                          `/prescriptions/${prescription.id}/pdf`,
                          `MediBook-Prescription-${prescription.prescriptionNumber}.pdf`,
                        ).catch((error) => toast.error(error instanceof Error ? error.message : 'Unable to download PDF'))
                      }
                    >
                      <Download /> PDF
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`${basePath}/${prescription.id}`}>
                        View <ChevronRight />
                      </Link>
                    </Button>
                  </div>
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
          icon={Pill}
          title="No prescriptions found"
          description="Prescriptions issued by your doctor after a consultation will appear here."
        />
      )}
    </div>
  );
}
