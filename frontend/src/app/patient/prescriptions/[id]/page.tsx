'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { Prescription } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { PrescriptionDetail } from '@/components/prescriptions/prescription-detail';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function PatientPrescriptionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const query = useQuery({
    queryKey: ['prescription', id],
    queryFn: () => apiRequest<Prescription>(`/prescriptions/${id}`),
    enabled: Boolean(id),
  });

  return (
    <div>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500">
          <Link href="/patient/prescriptions">
            <ArrowLeft /> All prescriptions
          </Link>
        </Button>
      </div>
      <PageHeader title="Prescription" description="Review your medicines and download a signed copy." />
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : query.isError || !query.data ? (
        <ErrorState
          title="Prescription unavailable"
          description="This prescription could not be found or you do not have access to it."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <PrescriptionDetail prescription={query.data} />
      )}
    </div>
  );
}
