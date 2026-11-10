'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, Edit3, PackageCheck, Plus, Power, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { BILLING_CYCLES, SUBSCRIPTION_STATUSES } from '@/lib/domain/enums';
import { formatCurrencyMinor, formatDate } from '@/lib/utils';
import { apiFetch } from '@/services/api-client';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  targetProviderType: 'DOCTOR' | 'HOSPITAL' | 'BOTH';
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  priceMinor: number;
  currency: string;
  monthlyLeadQuota: number;
  featuresJson: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { subscriptions: number };
}

interface SubscriptionRow {
  id: string;
  providerType: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  leadsAllocatedInPeriod: number;
  leadsConsumedInPeriod: number;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: string;
    code: string;
    name: string;
    billingCycle: string;
    priceMinor: number;
    currency: string;
    monthlyLeadQuota: number;
  };
  doctor: {
    id: string;
    city: string | null;
    user: { fullName: string; email: string };
  } | null;
  hospital: {
    id: string;
    displayName: string;
    legalName: string;
    contactEmail: string;
    city: string | null;
  } | null;
}

const planFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Code must be 2–40 characters')
    .max(40)
    .regex(/^[A-Za-z0-9_]+$/, 'Use letters, numbers, and underscores only'),
  name: z.string().trim().min(2, 'Plan name is required').max(120),
  description: z.string().trim().max(500).optional(),
  targetProviderType: z.enum(['DOCTOR', 'HOSPITAL', 'BOTH']),
  billingCycle: z.enum(BILLING_CYCLES),
  priceMajor: z.coerce.number().min(0, 'Price cannot be negative'),
  currency: z.string().trim().length(3, 'Use 3-letter code e.g. USD'),
  monthlyLeadQuota: z.coerce.number().int().min(0, 'Quota must be 0 or greater'),
  featuresText: z.string().optional(),
  isActive: z.boolean(),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

function parseFeatures(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function SubscriptionsClient({ canManage }: { canManage: boolean }) {
  const [summary, setSummary] = useState({
    totalPlans: 0,
    activePlans: 0,
    activeSubscriptions: 0,
    expiringSoonCount: 0,
  });
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingPlanId, setTogglingPlanId] = useState<string | null>(null);

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      targetProviderType: 'BOTH',
      billingCycle: 'MONTHLY',
      priceMajor: 0,
      currency: 'USD',
      monthlyLeadQuota: 25,
      featuresText: '',
      isActive: true,
    },
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '15' });
      if (q.trim()) qs.set('q', q.trim());
      if (statusFilter) qs.set('status', statusFilter);
      if (providerFilter) qs.set('providerType', providerFilter);

      const res = await apiFetch(`/api/admin/subscriptions?${qs.toString()}`, { cache: 'no-store' });
      const json = (await res.json()) as {
        data?: {
          summary: typeof summary;
          plans: PlanRow[];
          subscriptions: SubscriptionRow[];
          pagination: { total: number };
        };
        error?: { message: string };
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to load subscriptions.');
      }
      setSummary(json.data.summary);
      setPlans(json.data.plans);
      setSubscriptions(json.data.subscriptions);
      setTotal(json.data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subscriptions.');
    } finally {
      setLoading(false);
    }
  }, [page, q, statusFilter, providerFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreateModal() {
    setEditingPlan(null);
    setFormError(null);
    form.reset({
      code: '',
      name: '',
      description: '',
      targetProviderType: 'BOTH',
      billingCycle: 'MONTHLY',
      priceMajor: 0,
      currency: 'USD',
      monthlyLeadQuota: 25,
      featuresText: '',
      isActive: true,
    });
    setModalOpen(true);
  }

  function openEditModal(plan: PlanRow) {
    setEditingPlan(plan);
    setFormError(null);
    form.reset({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? '',
      targetProviderType: plan.targetProviderType,
      billingCycle: plan.billingCycle,
      priceMajor: Number((plan.priceMinor / 100).toFixed(2)),
      currency: plan.currency,
      monthlyLeadQuota: plan.monthlyLeadQuota,
      featuresText: parseFeatures(plan.featuresJson).join('\n'),
      isActive: plan.isActive,
    });
    setModalOpen(true);
  }

  async function onSubmitPlan(values: PlanFormValues) {
    setFormError(null);
    const features = (values.featuresText ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const priceMinor = Math.round(values.priceMajor * 100);

    try {
      const res = editingPlan
        ? await apiFetch(`/api/admin/subscriptions/plans/${editingPlan.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: values.name,
              description: values.description || null,
              targetProviderType: values.targetProviderType,
              billingCycle: values.billingCycle,
              priceMinor,
              currency: values.currency.toUpperCase(),
              monthlyLeadQuota: values.monthlyLeadQuota,
              features,
              isActive: values.isActive,
            }),
          })
        : await apiFetch('/api/admin/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: values.code.toUpperCase(),
              name: values.name,
              description: values.description || undefined,
              targetProviderType: values.targetProviderType,
              billingCycle: values.billingCycle,
              priceMinor,
              currency: values.currency.toUpperCase(),
              monthlyLeadQuota: values.monthlyLeadQuota,
              features,
              isActive: values.isActive,
            }),
          });

      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to save plan.');
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save subscription plan.');
    }
  }

  async function togglePlanStatus(plan: PlanRow) {
    setTogglingPlanId(plan.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/subscriptions/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Unable to toggle plan status.');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan status update failed.');
    } finally {
      setTogglingPlanId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Subscriptions &amp; Plans
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage provider subscription plans, monthly lead quotas, and active billing periods.
          </p>
        </div>
        {canManage ? (
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Create Plan
          </Button>
        ) : null}
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Total Plans</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {summary.totalPlans}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Active Plans</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {summary.activePlans}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-teal-700 dark:text-teal-400">
            {summary.activeSubscriptions}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Expiring (&le; 14 Days)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
            <CalendarClock className="h-5 w-5" />
            {summary.expiringSoonCount}
          </CardContent>
        </Card>
      </div>

      {/* Plans Catalog */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Subscription Plans Catalog
        </h2>
        {loading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : plans.length === 0 ? (
          <EmptyState
            title="No subscription plans configured"
            description="No subscription plans exist in the SQLite database yet. Create a plan to allow doctors and hospitals to subscribe."
            action={
              canManage ? (
                <Button size="sm" onClick={openCreateModal}>
                  <Plus className="h-4 w-4" />
                  Create Plan
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <Th>Plan</Th>
                  <Th>Target</Th>
                  <Th>Cycle</Th>
                  <Th>Price</Th>
                  <Th>Lead Quota / Mo</Th>
                  <Th>Subscribers</Th>
                  <Th>Status</Th>
                  {canManage ? <Th className="text-right">Actions</Th> : null}
                </tr>
              </TableHead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <Td>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{plan.name}</div>
                      <div className="text-xs text-slate-500">{plan.code}</div>
                      {plan.description ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{plan.description}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge variant="outline">{plan.targetProviderType}</Badge>
                    </Td>
                    <Td>{plan.billingCycle}</Td>
                    <Td className="font-medium">{formatCurrencyMinor(plan.priceMinor, plan.currency)}</Td>
                    <Td>{plan.monthlyLeadQuota}</Td>
                    <Td>{plan._count.subscriptions}</Td>
                    <Td>
                      <Badge variant={plan.isActive ? 'success' : 'danger'}>
                        {plan.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </Td>
                    {canManage ? (
                      <Td className="text-right">
                        <div className="inline-flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditModal(plan)}>
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={plan.isActive ? 'secondary' : 'default'}
                            disabled={togglingPlanId === plan.id}
                            onClick={() => void togglePlanStatus(plan)}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {plan.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </div>

      {/* Provider Subscriptions */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Provider Subscriptions &amp; Usage
          </h2>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search provider name, email, hospital, or plan..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={providerFilter}
            onChange={(e) => {
              setProviderFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All provider types</option>
            <option value="DOCTOR">Doctor</option>
            <option value="HOSPITAL">Hospital</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All subscription statuses</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : subscriptions.length === 0 ? (
          <EmptyState
            title="No provider subscriptions found"
            description="No doctor or hospital subscriptions match your current filters."
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <Th>Provider</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Lead Quota Usage</Th>
                  <Th>Current Period</Th>
                  <Th>Renewal</Th>
                </tr>
              </TableHead>
              <tbody>
                {subscriptions.map((sub) => {
                  const providerName =
                    sub.providerType === 'DOCTOR'
                      ? sub.doctor?.user.fullName ?? 'Doctor'
                      : sub.hospital?.displayName ?? sub.hospital?.legalName ?? 'Hospital';
                  const providerEmail =
                    sub.providerType === 'DOCTOR'
                      ? sub.doctor?.user.email ?? '—'
                      : sub.hospital?.contactEmail ?? '—';
                  const pct =
                    sub.leadsAllocatedInPeriod > 0
                      ? Math.min(100, Math.round((sub.leadsConsumedInPeriod / sub.leadsAllocatedInPeriod) * 100))
                      : 0;

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <Td>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{providerName}</div>
                        <div className="text-xs text-slate-500">
                          {sub.providerType} &bull; {providerEmail}
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5 font-medium">
                          <PackageCheck className="h-3.5 w-3.5 text-teal-600" />
                          {sub.plan.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatCurrencyMinor(sub.plan.priceMinor, sub.plan.currency)} / {sub.plan.billingCycle}
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={statusBadgeVariant(sub.status)}>{sub.status}</Badge>
                      </Td>
                      <Td>
                        <div className="text-xs font-medium">
                          {sub.leadsConsumedInPeriod} / {sub.leadsAllocatedInPeriod} ({pct}%)
                        </div>
                        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
                        </div>
                      </Td>
                      <Td className="text-xs">
                        <div>{formatDate(sub.currentPeriodStart)} &rarr;</div>
                        <div className="font-medium">{formatDate(sub.currentPeriodEnd)}</div>
                      </Td>
                      <Td className="text-xs">
                        {sub.cancelAtPeriodEnd ? (
                          <Badge variant="warning">Cancels at period end</Badge>
                        ) : (
                          <span className="text-slate-500">Auto-renew enabled</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <TablePagination page={page} pageSize={15} total={total} onPageChange={setPage} />
          </TableContainer>
        )}
      </div>

      <ModalDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPlan ? `Edit Plan: ${editingPlan.code}` : 'Create Subscription Plan'}
        description="Configure subscription pricing, billing cycle, and monthly lead allocation."
      >
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmitPlan)}>
          <ErrorBanner message={formError} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Plan Code
              </label>
              <Input
                placeholder="GROWTH_MONTHLY"
                disabled={Boolean(editingPlan)}
                {...form.register('code')}
              />
              {form.formState.errors.code ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.code.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Display Name
              </label>
              <Input placeholder="Growth Care Plan" {...form.register('name')} />
              {form.formState.errors.name ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.name.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Target Provider
              </label>
              <Select {...form.register('targetProviderType')}>
                <option value="BOTH">Doctor &amp; Hospital</option>
                <option value="DOCTOR">Doctor Only</option>
                <option value="HOSPITAL">Hospital Only</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Billing Cycle
              </label>
              <Select {...form.register('billingCycle')}>
                {BILLING_CYCLES.map((cycle) => (
                  <option key={cycle} value={cycle}>
                    {cycle}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Price (Major Unit)
              </label>
              <Input type="number" step="0.01" min="0" {...form.register('priceMajor')} />
              {form.formState.errors.priceMajor ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.priceMajor.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Currency
              </label>
              <Input maxLength={3} placeholder="USD" {...form.register('currency')} />
              {form.formState.errors.currency ? (
                <p className="mt-1 text-xs text-rose-600">{form.formState.errors.currency.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Monthly Lead Quota
              </label>
              <Input type="number" min="0" {...form.register('monthlyLeadQuota')} />
              {form.formState.errors.monthlyLeadQuota ? (
                <p className="mt-1 text-xs text-rose-600">
                  {form.formState.errors.monthlyLeadQuota.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Description
            </label>
            <Input placeholder="Optional summary shown to subscribing providers" {...form.register('description')} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Included Features (one per line)
            </label>
            <Textarea
              placeholder="Priority specialist matching&#10;Teleconsultation scheduling&#10;Monthly performance digest"
              {...form.register('featuresText')}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...form.register('isActive')} />
            Plan is active and available for new subscriptions
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
            </Button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
