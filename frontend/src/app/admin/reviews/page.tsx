'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Star } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AdminReview, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={cn('h-3.5 w-3.5', value <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
        />
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, []);

  const query = useQuery({
    queryKey: ['admin', 'reviews', page],
    queryFn: () => apiMeta<AdminReview[]>('/admin/reviews', { query: { page, limit: 15 } }),
    placeholderData: keepPreviousData,
  });

  const moderate = useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      apiRequest(`/admin/reviews/${id}`, { method: 'PATCH', body: { isVisible } }),
    onSuccess: (_result, variables) => {
      toast.success(variables.isVisible ? 'Review published' : 'Review hidden');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update review'),
  });

  const reviews = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  const hidden = reviews.filter((review) => !review.isVisible).length;

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Patient feedback after completed consultations. Hide reviews that breach content guidelines."
      />

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load reviews." onRetry={() => void query.refetch()} />
      ) : reviews.length ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><Star className="h-5 w-5 fill-amber-400" /></span>
              <div><p className="text-xs text-slate-500">Average on this page</p><p className="text-lg font-bold text-slate-900">{average.toFixed(1)} / 5</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Eye className="h-5 w-5" /></span>
              <div><p className="text-xs text-slate-500">Published</p><p className="text-lg font-bold text-slate-900">{reviews.length - hidden}</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><EyeOff className="h-5 w-5" /></span>
              <div><p className="text-xs text-slate-500">Hidden</p><p className="text-lg font-bold text-slate-900">{hidden}</p></div>
            </Card>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Visibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-800">{review.patientName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{review.appointmentNumber}</p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">Dr. {review.doctorName}</TableCell>
                    <TableCell><Stars rating={review.rating} /></TableCell>
                    <TableCell className="max-w-[320px]">
                      <p className="line-clamp-3 text-sm text-slate-600">{review.comment || <span className="text-slate-400">No comment</span>}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDateTime(review.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={moderate.isPending && moderate.variables?.id === review.id}
                        onClick={() => moderate.mutate({ id: review.id, isVisible: !review.isVisible })}
                      >
                        {review.isVisible ? <><EyeOff /> Hide</> : <><Eye /> Publish</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={pagination?.page ?? page} totalPages={pagination?.totalPages ?? 1} total={pagination?.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon={Star} title="No reviews yet" description="Reviews appear after patients complete consultations." />
      )}
    </div>
  );
}
