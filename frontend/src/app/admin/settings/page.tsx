'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { PlatformSettings } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatDateTime } from '@/lib/utils';

interface SettingsResponse {
  settings: PlatformSettings;
  meta: Array<{ key: string; description: string | null; updatedAt: string }>;
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlatformSettings | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => apiRequest<SettingsResponse>('/admin/settings'),
  });

  useEffect(() => {
    if (query.data?.settings) setForm(query.data.settings);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (payload: Partial<PlatformSettings>) =>
      apiRequest<SettingsResponse>('/admin/settings', { method: 'PATCH', body: payload }),
    onSuccess: (result) => {
      toast.success('Platform settings saved');
      setForm(result.settings);
      queryClient.setQueryData(['admin', 'settings'], result);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save settings'),
  });

  const meta = query.data?.meta ?? [];
  const lastUpdated = meta.reduce<string | null>((latest, item) => {
    if (!latest || new Date(item.updatedAt) > new Date(latest)) return item.updatedAt;
    return latest;
  }, null);

  function update<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleSave() {
    if (!form) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.support_email)) {
      toast.error('Enter a valid support email address');
      return;
    }
    save.mutate(form);
  }

  return (
    <div>
      <PageHeader
        title="Platform settings"
        description="Booking rules, payment options and support details used across MediBook."
        actions={
          <Button onClick={handleSave} loading={save.isPending} disabled={!form}>
            <Save /> Save changes
          </Button>
        }
      />

      {query.isLoading || !form ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load platform settings." onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-600" /> Booking rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="notice">Minimum booking notice (minutes)</Label>
                <Input
                  id="notice"
                  className="mt-2"
                  type="number"
                  min={0}
                  max={10080}
                  value={form.booking_min_notice_minutes}
                  onChange={(event) => update('booking_min_notice_minutes', Number(event.target.value))}
                />
                <p className="mt-1 text-xs text-slate-500">How far in advance a slot must be booked.</p>
              </div>
              <div>
                <Label htmlFor="advance">Maximum advance booking (days)</Label>
                <Input
                  id="advance"
                  className="mt-2"
                  type="number"
                  min={1}
                  max={365}
                  value={form.booking_max_advance_days}
                  onChange={(event) => update('booking_max_advance_days', Number(event.target.value))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cancel">Cancellation window (hours)</Label>
                  <Input
                    id="cancel"
                    className="mt-2"
                    type="number"
                    min={0}
                    max={720}
                    value={form.cancellation_min_hours}
                    onChange={(event) => update('cancellation_min_hours', Number(event.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="reschedule">Reschedule window (hours)</Label>
                  <Input
                    id="reschedule"
                    className="mt-2"
                    type="number"
                    min={0}
                    max={720}
                    value={form.reschedule_min_hours}
                    onChange={(event) => update('reschedule_min_hours', Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Allow pay at clinic</p>
                  <p className="text-xs text-slate-500">Patients can confirm now and pay at the front desk.</p>
                </div>
                <Switch checked={form.pay_at_clinic_enabled} onCheckedChange={(checked) => update('pay_at_clinic_enabled', checked)} aria-label="Allow pay at clinic" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Auto-confirm appointments</p>
                  <p className="text-xs text-slate-500">Confirm paid bookings without manual review.</p>
                </div>
                <Switch checked={form.auto_confirm_appointments} onCheckedChange={(checked) => update('auto_confirm_appointments', checked)} aria-label="Auto-confirm appointments" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Clinic & support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="clinic-name">Clinic display name</Label>
                  <Input
                    id="clinic-name"
                    className="mt-2"
                    maxLength={120}
                    value={form.clinic_name}
                    onChange={(event) => update('clinic_name', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="support-email">Support email</Label>
                  <Input
                    id="support-email"
                    className="mt-2"
                    type="email"
                    value={form.support_email}
                    onChange={(event) => update('support_email', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="support-phone">Support phone</Label>
                  <Input
                    id="support-phone"
                    className="mt-2"
                    maxLength={30}
                    value={form.support_phone}
                    onChange={(event) => update('support_phone', event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="refund-days">Refund processing days</Label>
                  <Input
                    id="refund-days"
                    className="mt-2"
                    type="number"
                    min={0}
                    max={60}
                    value={form.refund_processing_days}
                    onChange={(event) => update('refund_processing_days', Number(event.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" /> Operational controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Maintenance mode</p>
                    <p className="text-xs text-slate-500">Pauses new online bookings. Existing appointments are unaffected.</p>
                  </div>
                  <Switch checked={form.maintenance_mode} onCheckedChange={(checked) => update('maintenance_mode', checked)} aria-label="Maintenance mode" />
                </div>
                {lastUpdated && (
                  <p className="text-xs text-slate-400">Settings last updated {formatDateTime(lastUpdated)}.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
