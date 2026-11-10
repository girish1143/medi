'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Pencil, Phone, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { Clinic } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ClinicForm {
  name: string;
  addressLine1: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isActive: boolean;
}

const EMPTY_FORM: ClinicForm = {
  name: '',
  addressLine1: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  isActive: true,
};

export default function AdminClinicsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ClinicForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'clinics'],
    queryFn: () => apiRequest<Clinic[]>('/admin/clinics'),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        addressLine1: form.addressLine1.trim(),
        area: form.area.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        phone: form.phone.trim() || undefined,
        ...(editing ? { isActive: form.isActive } : {}),
      };
      return editing
        ? apiRequest(`/admin/clinics/${editing.id}`, { method: 'PATCH', body })
        : apiRequest('/admin/clinics', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(editing ? 'Clinic updated' : 'Clinic created');
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clinics'] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Unable to save clinic'),
  });

  const toggleActive = useMutation({
    mutationFn: (clinic: Clinic) =>
      apiRequest(`/admin/clinics/${clinic.id}`, { method: 'PATCH', body: { isActive: !clinic.is_active } }),
    onSuccess: (_result, clinic) => {
      toast.success(clinic.is_active ? 'Clinic deactivated' : 'Clinic activated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clinics'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update clinic'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (clinic: Clinic) => {
    setEditing(clinic);
    setForm({
      name: clinic.name,
      addressLine1: clinic.address_line1,
      area: clinic.area ?? '',
      city: clinic.city,
      state: clinic.state,
      pincode: clinic.pincode,
      phone: clinic.phone ?? '',
      isActive: clinic.is_active,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const clinics = query.data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? clinics.filter((clinic) =>
        [clinic.name, clinic.city, clinic.area, clinic.pincode].some((value) => (value ?? '').toLowerCase().includes(term)),
      )
    : clinics;

  return (
    <div>
      <PageHeader
        title="Clinics"
        description="Physical locations where in-clinic consultations happen. Doctors are assigned to clinics from the Doctors page."
        actions={
          <Button onClick={openCreate}>
            <Plus /> New clinic
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, city or pincode"
            className="pl-9"
            aria-label="Search clinics"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load clinics." onRetry={() => void query.refetch()} />
      ) : filtered.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((clinic) => (
            <Card key={clinic.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-900">{clinic.name}</h3>
                    <p className="mt-1 flex items-start gap-1 text-sm leading-relaxed text-slate-500">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        {clinic.address_line1}
                        {clinic.area ? `, ${clinic.area}` : ''}
                        <br />
                        {clinic.city}, {clinic.state} — {clinic.pincode}
                      </span>
                    </p>
                    {clinic.phone && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <Phone className="h-3 w-3" /> {clinic.phone}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={
                    clinic.is_active
                      ? 'shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200'
                      : 'shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200'
                  }
                >
                  {clinic.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <Switch
                    checked={clinic.is_active}
                    disabled={toggleActive.isPending && toggleActive.variables?.id === clinic.id}
                    onCheckedChange={() => toggleActive.mutate(clinic)}
                    aria-label={`Toggle ${clinic.name}`}
                  />
                  Accepting bookings
                </label>
                <Button size="sm" variant="outline" onClick={() => openEdit(clinic)}>
                  <Pencil /> Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          title={term ? 'No matching clinics' : 'No clinics yet'}
          description={term ? 'Try a different search term.' : 'Add a clinic so doctors can offer in-clinic consultations.'}
          action={term ? { label: 'Clear search', onClick: () => setSearch('') } : { label: 'New clinic', onClick: openCreate }}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit clinic' : 'New clinic'}</DialogTitle>
            <DialogDescription>
              Clinic details appear on doctor profiles and in appointment confirmations.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinic-name">Clinic name</Label>
              <Input
                id="clinic-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="MediBook Clinic — Indiranagar"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinic-address">Address line</Label>
              <Input
                id="clinic-address"
                value={form.addressLine1}
                onChange={(event) => setForm((current) => ({ ...current, addressLine1: event.target.value }))}
                placeholder="100 Feet Road, 2nd Stage"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clinic-area">Area / locality</Label>
              <Input
                id="clinic-area"
                value={form.area}
                onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                placeholder="Indiranagar"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clinic-city">City</Label>
              <Input
                id="clinic-city"
                value={form.city}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                placeholder="Bengaluru"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clinic-state">State</Label>
              <Input
                id="clinic-state"
                value={form.state}
                onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                placeholder="Karnataka"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clinic-pincode">Pincode</Label>
              <Input
                id="clinic-pincode"
                value={form.pincode}
                onChange={(event) => setForm((current) => ({ ...current, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="560038"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinic-phone">Phone (optional)</Label>
              <Input
                id="clinic-phone"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+91 80 4123 5678"
                maxLength={20}
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 sm:col-span-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">Active</p>
                  <p className="text-xs text-slate-500">Inactive clinics cannot accept new bookings.</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                />
              </div>
            )}
            {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 sm:col-span-2">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={
                form.name.trim().length < 2 ||
                form.addressLine1.trim().length < 3 ||
                form.city.trim().length < 2 ||
                form.state.trim().length < 2 ||
                form.pincode.length !== 6
              }
              onClick={() => {
                setFormError('');
                save.mutate();
              }}
            >
              {editing ? 'Save changes' : 'Create clinic'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
