'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Sparkles, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { AdminSpecialty } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SpecialtyForm {
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
}

const EMPTY_FORM: SpecialtyForm = { name: '', description: '', icon: '', isActive: true };

export default function AdminSpecialtiesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminSpecialty | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SpecialtyForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'specialties'],
    queryFn: () => apiRequest<AdminSpecialty[]>('/admin/specialties'),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon.trim() || undefined,
        ...(editing ? { isActive: form.isActive } : {}),
      };
      return editing
        ? apiRequest(`/admin/specialties/${editing.id}`, { method: 'PATCH', body })
        : apiRequest('/admin/specialties', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(editing ? 'Specialty updated' : 'Specialty created');
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'specialties'] });
      void queryClient.invalidateQueries({ queryKey: ['specialties'] });
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Unable to save specialty'),
  });

  const toggleActive = useMutation({
    mutationFn: (specialty: AdminSpecialty) =>
      apiRequest(`/admin/specialties/${specialty.id}`, { method: 'PATCH', body: { isActive: !specialty.is_active } }),
    onSuccess: (_result, specialty) => {
      toast.success(specialty.is_active ? 'Specialty hidden from the website' : 'Specialty published');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'specialties'] });
      void queryClient.invalidateQueries({ queryKey: ['specialties'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update specialty'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (specialty: AdminSpecialty) => {
    setEditing(specialty);
    setForm({
      name: specialty.name,
      description: specialty.description ?? '',
      icon: specialty.icon ?? '',
      isActive: specialty.is_active,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const specialties = query.data ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? specialties.filter(
        (specialty) =>
          specialty.name.toLowerCase().includes(term) ||
          specialty.slug.toLowerCase().includes(term) ||
          (specialty.description ?? '').toLowerCase().includes(term),
      )
    : specialties;
  const activeCount = specialties.filter((specialty) => specialty.is_active).length;
  const coveredDoctors = specialties.reduce((sum, specialty) => sum + specialty.doctor_count, 0);

  return (
    <div>
      <PageHeader
        title="Specialties"
        description="The medical specialities shown in search, filters and the homepage. Hiding one removes it from the public site without deleting history."
        actions={
          <Button onClick={openCreate}>
            <Plus /> New specialty
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total specialties</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{specialties.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Published</p>
          <p className="mt-1 text-2xl font-bold text-teal-600">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Doctor assignments</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{coveredDoctors}</p>
        </Card>
      </div>

      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search specialties"
            className="pl-9"
            aria-label="Search specialties"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load specialties." onRetry={() => void query.refetch()} />
      ) : filtered.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((specialty) => (
            <Card key={specialty.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <span
                  className={
                    specialty.is_active
                      ? 'rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200'
                      : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200'
                  }
                >
                  {specialty.is_active ? 'Published' : 'Hidden'}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{specialty.name}</h3>
              <p className="mt-0.5 font-mono text-[11px] text-slate-400">/{specialty.slug}</p>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-slate-500">
                {specialty.description || 'No description added yet.'}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" /> {specialty.doctor_count} doctors
                </span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={specialty.is_active}
                    disabled={toggleActive.isPending && toggleActive.variables?.id === specialty.id}
                    onCheckedChange={() => toggleActive.mutate(specialty)}
                    aria-label={`Toggle ${specialty.name}`}
                  />
                  <Button size="sm" variant="outline" onClick={() => openEdit(specialty)}>
                    <Pencil /> Edit
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Stethoscope}
          title={term ? 'No matching specialties' : 'No specialties yet'}
          description={term ? 'Try a different search term.' : 'Create your first specialty so doctors can be listed.'}
          action={term ? { label: 'Clear search', onClick: () => setSearch('') } : { label: 'New specialty', onClick: openCreate }}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit specialty' : 'New specialty'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update how this specialty appears across MediBook.'
                : 'Add a medical speciality that doctors can be assigned to.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="specialty-name">Name</Label>
              <Input
                id="specialty-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Cardiology"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="specialty-description">Description</Label>
              <Textarea
                id="specialty-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="A short description shown on the specialties page."
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="specialty-icon">Icon key (optional)</Label>
              <Input
                id="specialty-icon"
                value={form.icon}
                onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
                placeholder="heart-pulse"
                maxLength={60}
              />
              <p className="text-[11px] text-slate-400">Used by the public site when rendering specialty cards.</p>
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Published</p>
                  <p className="text-xs text-slate-500">Visible on the public website.</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                />
              </div>
            )}
            {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={form.name.trim().length < 2}
              onClick={() => {
                setFormError('');
                save.mutate();
              }}
            >
              {editing ? 'Save changes' : 'Create specialty'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
