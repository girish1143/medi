'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ReceiptText, RotateCcw, Search, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AdminPayment, AdminRefund, PaginationMeta } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDateTime, titleCase } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'captured', label: 'Captured' },
  { value: 'created', label: 'Created' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'partially_refunded', label: 'Partially refunded' },
];

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'All providers' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'pay_at_clinic', label: 'Pay at clinic' },
  { value: 'manual', label: 'Manual' },
];

export default function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'payments' | 'refunds'>('payments');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState<AdminPayment | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tab, status, provider, debounced]);

  const payments = useQuery({
    queryKey: ['admin', 'payments', status, provider, debounced, page],
    queryFn: () =>
      apiMeta<AdminPayment[]>('/admin/payments', {
        query: {
          status: status === 'all' ? undefined : status,
          provider: provider === 'all' ? undefined : provider,
          search: debounced || undefined,
          page,
          limit: 12,
        },
      }),
    enabled: tab === 'payments',
    placeholderData: keepPreviousData,
  });

  const refunds = useQuery({
    queryKey: ['admin', 'refunds', page],
    queryFn: () => apiMeta<AdminRefund[]>('/admin/refunds', { query: { page, limit: 12 } }),
    enabled: tab === 'refunds',
    placeholderData: keepPreviousData,
  });

  const refund = useMutation({
    mutationFn: () =>
      apiRequest(`/payments/${refundTarget?.id}/refund`, {
        method: 'POST',
        body: {
          amount: refundAmount ? Number(refundAmount) : undefined,
          reason: refundReason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success('Refund initiated');
      setRefundTarget(null);
      setRefundAmount('');
      setRefundReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to process refund'),
  });

  const paymentRows = payments.data?.data ?? [];
  const refundRows = refunds.data?.data ?? [];
  const paymentPagination = payments.data?.meta.pagination as PaginationMeta | undefined;
  const refundPagination = refunds.data?.meta.pagination as PaginationMeta | undefined;
  const activeQuery = tab === 'payments' ? payments : refunds;
  const pagination = tab === 'payments' ? paymentPagination : refundPagination;
  const filtered = Boolean(debounced) || status !== 'all' || provider !== 'all';

  const capturedTotal = paymentRows
    .filter((row) => row.status === 'captured' || row.status === 'partially_refunded')
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <div>
      <PageHeader
        title="Payments & refunds"
        description="Monitor collections and process refunds. Paid online appointments are refunded automatically when cancelled."
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <TabsList>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="refunds">Refunds</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab === 'payments' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Patient, doctor or reference"
                  className="pl-9 sm:w-60"
                  aria-label="Search payments"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="sm:w-44" aria-label="Filter by status">
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
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="sm:w-44" aria-label="Filter by provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {activeQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : activeQuery.isError ? (
        <ErrorState description="We could not load payments." onRetry={() => void activeQuery.refetch()} />
      ) : tab === 'payments' ? (
        paymentRows.length ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Wallet className="h-5 w-5" /></span>
                <div><p className="text-xs text-slate-500">Page collections</p><p className="text-lg font-bold text-slate-900">{formatCurrency(capturedTotal)}</p></div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CreditCard className="h-5 w-5" /></span>
                <div><p className="text-xs text-slate-500">Paid online</p><p className="text-lg font-bold text-slate-900">{paymentRows.filter((row) => row.provider === 'razorpay' && (row.status === 'captured' || row.status === 'partially_refunded')).length}</p></div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><ReceiptText className="h-5 w-5" /></span>
                <div><p className="text-xs text-slate-500">Pay at clinic</p><p className="text-lg font-bold text-slate-900">{paymentRows.filter((row) => row.provider === 'pay_at_clinic').length}</p></div>
              </Card>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <p className="font-mono text-xs font-semibold text-slate-700">{payment.appointmentNumber}</p>
                        <p className="text-[11px] text-slate-400">{formatDateTime(payment.createdAt)}</p>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{payment.patientName}</TableCell>
                      <TableCell className="text-sm text-slate-700">Dr. {payment.doctorName}</TableCell>
                      <TableCell className="font-medium text-slate-800">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell className="text-sm capitalize text-slate-600">{payment.provider.replace(/_/g, ' ')}</TableCell>
                      <TableCell><StatusBadge status={payment.status} kind="payment" /></TableCell>
                      <TableCell className="text-xs text-slate-500">{payment.paidAt ? formatDateTime(payment.paidAt) : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!['captured', 'partially_refunded'].includes(payment.status)}
                          onClick={() => setRefundTarget(payment)}
                        >
                          <RotateCcw /> Refund
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
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description={filtered ? 'No payment matches the selected filters.' : 'Payments will appear here once patients book.'}
            action={filtered ? { label: 'Clear filters', onClick: () => { setSearch(''); setStatus('all'); setProvider('all'); } } : undefined}
          />
        )
      ) : refundRows.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refundRows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold text-slate-700">{item.appointmentNumber}</p>
                      <p className="text-[11px] text-slate-400">{item.providerRefundId ?? '—'}</p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{item.patientName}</TableCell>
                    <TableCell className="font-medium text-slate-800">{formatCurrency(item.amount)}</TableCell>
                    <TableCell className="max-w-[220px] text-sm text-slate-600">{item.reason}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                        {titleCase(item.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell className="text-xs text-slate-500">{item.processedAt ? formatDateTime(item.processedAt) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={refundPagination?.page ?? page} totalPages={refundPagination?.totalPages ?? 1} total={refundPagination?.total} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon={RotateCcw} title="No refunds yet" description="Refunds raised for cancelled or rejected appointments will appear here." />
      )}

      <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => { if (!open) { setRefundTarget(null); setRefundAmount(''); setRefundReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process refund</DialogTitle>
            <DialogDescription>
              {refundTarget
                ? `Refund appointment ${refundTarget.appointmentNumber} paid by ${refundTarget.patientName}. Leave the amount blank to refund the full ${formatCurrency(refundTarget.amount)}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="refund-amount">Amount (₹, optional)</Label>
              <Input
                id="refund-amount"
                className="mt-2"
                type="number"
                min={1}
                max={refundTarget?.amount}
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                placeholder={refundTarget ? String(refundTarget.amount) : ''}
              />
            </div>
            <div>
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea
                id="refund-reason"
                className="mt-2"
                rows={3}
                maxLength={300}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="Explain why this refund is being issued"
              />
            </div>
            {refundTarget?.provider === 'pay_at_clinic' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This payment was collected at the clinic. Refunds are recorded for reconciliation only.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
            <Button
              loading={refund.isPending}
              disabled={refundReason.trim().length < 5}
              onClick={() => refund.mutate()}
            >
              <RotateCcw /> Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
