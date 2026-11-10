'use client';

import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, FolderHeart, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { API_URL, apiMeta, apiRequest } from '@/lib/api';
import type { MedicalRecord, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, titleCase } from '@/lib/utils';

const RECORD_TYPES = [
  { value: 'lab_report', label: 'Lab report' },
  { value: 'imaging', label: 'Imaging / scan' },
  { value: 'consultation_summary', label: 'Consultation summary' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'other', label: 'Other' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function absoluteFileUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${new URL(API_URL).origin}${path}`;
}

export default function PatientRecordsPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [page, setPage] = useState(1);
  const [recordType, setRecordType] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState('lab_report');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, recordType]);

  const query = useQuery({
    queryKey: ['medical-records', page, recordType, debounced],
    queryFn: () =>
      apiMeta<MedicalRecord[]>('/medical-records', {
        query: {
          page,
          limit: 10,
          recordType: recordType === 'all' ? undefined : recordType,
          search: debounced || undefined,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a file to upload');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('recordType', uploadType);
      return apiRequest<MedicalRecord>('/medical-records', { method: 'POST', formData });
    },
    onSuccess: () => {
      toast.success('Medical record uploaded');
      setUploadOpen(false);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['medical-records'] });
      void queryClient.invalidateQueries({ queryKey: ['patient', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to upload record'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/medical-records/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Record deleted');
      void queryClient.invalidateQueries({ queryKey: ['medical-records'] });
      void queryClient.invalidateQueries({ queryKey: ['patient', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to delete record'),
  });

  async function downloadRecord(record: MedicalRecord) {
    try {
      const result = await apiRequest<{ url: string; fileName: string }>(`/medical-records/${record.id}/download`);
      window.open(absoluteFileUrl(result.url), '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to download record');
    }
  }

  const items = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  return (
    <div>
      <PageHeader
        title="Health records"
        description="Keep lab reports, scans and consultation summaries together. Only you and your treating doctor can access them."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload /> Upload record
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by file name"
              className="pl-9 sm:w-64"
              aria-label="Search records"
            />
          </div>
          <Select value={recordType} onValueChange={setRecordType}>
            <SelectTrigger className="sm:w-48" aria-label="Filter by record type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All record types</SelectItem>
              {RECORD_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load your health records." onRetry={() => void query.refetch()} />
      ) : items.length ? (
        <>
          <div className="space-y-3">
            {items.map((record) => (
              <Card key={record.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{record.fileName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {titleCase(record.recordType)} · {formatBytes(record.fileSize)} · {formatDate(record.createdAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {record.appointmentNumber ? `Appointment ${record.appointmentNumber}` : 'General record'}
                      {record.uploadedBy ? ` · Uploaded by ${record.uploadedBy}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void downloadRecord(record)}>
                    <Download /> Download
                  </Button>
                  <ConfirmDialog
                    title="Delete this record?"
                    description="This removes the file from your health records. This action cannot be undone."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      await remove.mutateAsync(record.id);
                    }}
                    trigger={
                      <Button variant="ghost" size="icon-sm" className="text-rose-600" aria-label="Delete record">
                        <Trash2 />
                      </Button>
                    }
                  />
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
          icon={FolderHeart}
          title="No health records yet"
          description="Upload lab reports, scans or summaries to keep your care history in one place."
          action={{ label: 'Upload your first record', onClick: () => setUploadOpen(true) }}
        />
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a health record</DialogTitle>
            <DialogDescription>
              PDF, JPEG, PNG and WebP files are supported. Maximum size 10 MB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="record-file">File</Label>
              <Input
                id="record-file"
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                className="mt-2"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="mt-1.5 text-xs text-slate-500">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>
            <div>
              <Label>Record type</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button disabled={!file} loading={upload.isPending} onClick={() => upload.mutate()}>
              <Upload /> Upload record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
