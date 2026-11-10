'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, MessageSquareWarning, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AdminComplaint, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime, titleCase } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 ring-amber-200',
  in_review: 'bg-blue-50 text-blue-700 ring-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminComplaintsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminComplaint | null>(null);
  const [status, setStatus] = useState('in_review');
  const [resolution, setResolution] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'complaints', page],
    queryFn: () => apiMeta<AdminComplaint[]>('/admin/complaints', { query: { page, limit: 12 } }),
    placeholderData: keepPreviousData,
  });

  const update = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/complaints/${target?.id}`, {
        method: 'PATCH',
        body: { status, resolution: resolution.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success('Support request updated');
      setTarget(null);
      setResolution('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'complaints'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update request'),
  });

  const complaints = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const openCount = complaints.filter((item) => item.status === 'open' || item.status === 'in_review').length;

  function openDialog(complaint: AdminComplaint) {
    setTarget(complaint);
    setStatus(complaint.status === 'open' ? 'in_review' : complaint.status);
    setResolution(complaint.resolution ?? '');
  }

  return (
    <div>
      <PageHeader
        title="Complaints"
        description="Support requests raised by patients. Triage, respond and close each request."
      />

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load complaints." onRetry={() => void query.refetch()} />
      ) : complaints.length ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><MessageSquareWarning className="h-5 w-5" /></span>
              <div><p className="text-xs text-slate-500">Needs attention</p><p className="text-lg font-bold text-slate-900">{openCount}</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><LifeBuoy className="h-5 w-5" /></span>
              <div><p className="text-xs text-slate-500">Total on this page</p><p className="text-lg font-bold text-slate-900">{complaints.length}</p></div>
            </Card>
          </div>
          <div className="space-y-3">
            {complaints.map((complaint) => (
              <Card key={complaint.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{complaint.subject}</p>
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLES[complaint.status] ?? STATUS_STYLES.open)}>
                        {titleCase(complaint.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {complaint.patientName} · {complaint.patientEmail}
                      {complaint.appointmentNumber ? ` · ${complaint.appointmentNumber}` : ''} · {formatDateTime(complaint.createdAt)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{complaint.description}</p>
                    {complaint.resolution && (
                      <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                        <p className="font-semibold">Resolution</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{complaint.resolution}</p>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => openDialog(complaint)}>
                    Update
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Pagination page={pagination?.page ?? page} totalPages={pagination?.totalPages ?? 1} total={pagination?.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon={LifeBuoy} title="No support requests" description="Patient support requests will appear here." />
      )}

      <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update support request</DialogTitle>
            <DialogDescription>{target?.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="complaint-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="complaint-status" className="mt-2" aria-label="Complaint status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="complaint-resolution">Resolution / response</Label>
              <Textarea
                id="complaint-resolution"
                className="mt-2"
                rows={4}
                maxLength={1000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="Explain the outcome or next steps for the patient"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button loading={update.isPending} onClick={() => update.mutate()}>
              <Send /> Save update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
