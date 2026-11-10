'use client';

import { CreditCard, FileText, RotateCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ModalDialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
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
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '@/lib/domain/enums';
import { formatCurrencyMinor, formatDate, formatDateTime } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface PaymentRow {
  id: string;
  providerType: string;
  gatewayProvider: string;
  gatewayPaymentId: string;
  paymentMethodType: string;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  status: string;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  subscription: {
    id: string;
    plan: { name: string; code: string; billingCycle: string };
  };
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    totalMinor: number;
  } | null;
  doctor: {
    id: string;
    user: { fullName: string; email: string };
  } | null;
  hospital: {
    id: string;
    displayName: string;
    legalName: string;
    contactEmail: string;
  } | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  providerType: string;
  status: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  subscription: {
    id: string;
    plan: { name: string; code: string };
  };
  doctor: {
    id: string;
    user: { fullName: string; email: string };
  } | null;
  hospital: {
    id: string;
    displayName: string;
    legalName: string;
    contactEmail: string;
  } | null;
}

export function PaymentsClient({ canRefund }: { canRefund: boolean }) {
  const [summary, setSummary] = useState({
    succeededVolumeMinor: 0,
    refundedVolumeMinor: 0,
    failedCount: 0,
    openInvoicesCount: 0,
  });
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeTab, setActiveTab] = useState<'payments' | 'invoices'>('payments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundMajor, setRefundMajor] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundError, setRefundError] = useState<string | null>(null);
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter) qs.set('status', statusFilter);
      if (invoiceStatusFilter) qs.set('invoiceStatus', invoiceStatusFilter);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);

      const res = await apiFetch(`/api/admin/payments?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: {
          summary: typeof summary;
          payments: PaymentRow[];
          invoices: InvoiceRow[];
          pagination: { total: number };
        };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load payment records.');
      }
      setSummary(json.data.summary);
      setPayments(json.data.payments);
      setInvoices(json.data.invoices);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load payment records.');
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, invoiceStatusFilter, from, to]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openRefundModal(payment: PaymentRow) {
    const remainingMinor = Math.max(0, payment.amountMinor - payment.refundedMinor);
    setRefundTarget(payment);
    setRefundMajor((remainingMinor / 100).toFixed(2));
    setRefundReason('');
    setRefundError(null);
  }

  async function submitRefund() {
    if (!refundTarget) return;
    setRefundError(null);
    const parsedMajor = Number(refundMajor);
    const amountMinor = Math.round(parsedMajor * 100);
    if (!Number.isFinite(parsedMajor) || amountMinor <= 0) {
      setRefundError('Enter a valid positive refund amount.');
      return;
    }
    if (refundReason.trim().length < 5) {
      setRefundError('Provide a refund reason of at least 5 characters.');
      return;
    }

    setSubmittingRefund(true);
    try {
      const res = await apiFetch(`/api/admin/payments/${refundTarget.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor,
          reason: refundReason.trim(),
        }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Refund request failed.');
      }
      setRefundTarget(null);
      await loadData();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setSubmittingRefund(false);
    }
  }

  function providerLabel(row: {
    providerType: string;
    doctor: { user: { fullName: string; email: string } } | null;
    hospital: { displayName: string; legalName: string; contactEmail: string } | null;
  }) {
    if (row.providerType === 'DOCTOR') {
      return {
        name: row.doctor?.user.fullName ?? 'Doctor',
        email: row.doctor?.user.email ?? '—',
      };
    }
    return {
      name: row.hospital?.displayName ?? row.hospital?.legalName ?? 'Hospital',
      email: row.hospital?.contactEmail ?? '—',
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Payments &amp; Invoices
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tokenized payment ledger, subscription invoices, failed transactions, and audited refunds. Zero raw card data is stored.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Gross Settled Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrencyMinor(summary.succeededVolumeMinor, 'USD')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Total Refunded</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            {formatCurrencyMinor(summary.refundedVolumeMinor, 'USD')}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Failed Payments</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-rose-700 dark:text-rose-400">
            {summary.failedCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Open Invoices</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-teal-700 dark:text-teal-400">
            {summary.openInvoicesCount}
          </CardContent>
        </Card>
      </div>

      {/* Filters & Tab Switcher */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={activeTab === 'payments' ? 'default' : 'outline'}
            onClick={() => setActiveTab('payments')}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Payments ({total})
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'invoices' ? 'default' : 'outline'}
            onClick={() => setActiveTab('invoices')}
          >
            <FileText className="h-3.5 w-3.5" />
            Invoices ({invoices.length})
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search gateway ID, invoice #, or provider..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {activeTab === 'payments' ? (
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All payment statuses</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              value={invoiceStatusFilter}
              onChange={(e) => setInvoiceStatusFilter(e.target.value)}
            >
              <option value="">All invoice statuses</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
          <Input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : activeTab === 'payments' ? (
        payments.length === 0 ? (
          <EmptyState
            title="No payment transactions found"
            description="No payment records match your filters or exist in SQLite yet."
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <Th>Gateway / Method</Th>
                  <Th>Provider</Th>
                  <Th>Plan / Invoice</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  {canRefund ? <Th className="text-right">Action</Th> : null}
                </tr>
              </TableHead>
              <tbody>
                {payments.map((payment) => {
                  const provider = providerLabel(payment);
                  const refundable =
                    (payment.status === 'SUCCEEDED' || payment.status === 'PARTIALLY_REFUNDED') &&
                    payment.amountMinor > payment.refundedMinor;

                  return (
                    <tr key={payment.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <Td>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {payment.gatewayProvider}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{payment.gatewayPaymentId}</div>
                        <div className="text-xs text-slate-400">{payment.paymentMethodType}</div>
                      </Td>
                      <Td>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-xs text-slate-500">
                          {payment.providerType} &bull; {provider.email}
                        </div>
                      </Td>
                      <Td>
                        <div className="font-medium">{payment.subscription.plan.name}</div>
                        <div className="text-xs text-slate-500">
                          {payment.invoice ? `Invoice ${payment.invoice.invoiceNumber}` : 'No linked invoice'}
                        </div>
                      </Td>
                      <Td>
                        <div className="font-semibold">
                          {formatCurrencyMinor(payment.amountMinor, payment.currency)}
                        </div>
                        {payment.refundedMinor > 0 ? (
                          <div className="text-xs text-amber-700 dark:text-amber-400">
                            Refunded: {formatCurrencyMinor(payment.refundedMinor, payment.currency)}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <Badge variant={statusBadgeVariant(payment.status)}>{payment.status}</Badge>
                        {payment.failureMessage ? (
                          <div className="mt-1 max-w-44 truncate text-xs text-rose-600">
                            {payment.failureMessage}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {formatDateTime(payment.paidAt ?? payment.createdAt)}
                      </Td>
                      {canRefund ? (
                        <Td className="text-right">
                          {refundable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRefundModal(payment)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Refund
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </Td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
          </TableContainer>
        )
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="No subscription invoices match your current filters."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <Th>Invoice #</Th>
                <Th>Provider</Th>
                <Th>Plan &amp; Period</Th>
                <Th>Subtotal / Tax</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th>Due / Paid</Th>
              </tr>
            </TableHead>
            <tbody>
              {invoices.map((inv) => {
                const provider = providerLabel(inv);
                return (
                  <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <Td className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {inv.invoiceNumber}
                    </Td>
                    <Td>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-xs text-slate-500">{provider.email}</div>
                    </Td>
                    <Td>
                      <div className="font-medium">{inv.subscription.plan.name}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(inv.periodStart)} &ndash; {formatDate(inv.periodEnd)}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      <div>Sub: {formatCurrencyMinor(inv.subtotalMinor, inv.currency)}</div>
                      <div className="text-slate-500">
                        Tax: {formatCurrencyMinor(inv.taxMinor, inv.currency)}
                      </div>
                    </Td>
                    <Td className="font-semibold">
                      {formatCurrencyMinor(inv.totalMinor, inv.currency)}
                    </Td>
                    <Td>
                      <Badge variant={statusBadgeVariant(inv.status)}>{inv.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {inv.paidAt
                        ? `Paid ${formatDate(inv.paidAt)}`
                        : inv.dueAt
                          ? `Due ${formatDate(inv.dueAt)}`
                          : '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableContainer>
      )}

      <ModalDialog
        open={Boolean(refundTarget)}
        onClose={() => setRefundTarget(null)}
        title="Process Audited Refund"
        description={
          refundTarget
            ? `Remaining refundable balance: ${formatCurrencyMinor(
                refundTarget.amountMinor - refundTarget.refundedMinor,
                refundTarget.currency,
              )}`
            : undefined
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={refundError} />
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Refund Amount ({refundTarget?.currency ?? 'USD'})
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={refundMajor}
              onChange={(e) => setRefundMajor(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Audit Reason (min 5 chars)
            </label>
            <Textarea
              placeholder="Document authorization / reconciliation reason..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={submittingRefund}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void submitRefund()} disabled={submittingRefund}>
              {submittingRefund ? 'Recording Refund...' : 'Confirm Refund'}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
