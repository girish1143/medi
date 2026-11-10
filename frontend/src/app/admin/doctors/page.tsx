'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  Copy,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { AdminDoctor, Clinic, PaginationMeta, Specialty } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

const VERIFICATION_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  verified: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  suspended: 'bg-slate-100 text-slate-600 ring-slate-200',
};

interface DoctorFormState {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  qualification: string;
  registrationNumber: string;
  experienceYears: string;
  consultationFee: string;
  onlineConsultationFee: string;
  biography: string;
  specialtyIds: string[];
  clinicIds: string[];
}

const EMPTY_FORM: DoctorFormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  qualification: '',
  registrationNumber: '',
  experienceYears: '5',
  consultationFee: '600',
  onlineConsultationFee: '',
  biography: '',
  specialtyIds: [],
  clinicIds: [],
};

export default function AdminDoctorsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [verifyTarget, setVerifyTarget] = useState<{ doctor: AdminDoctor; status: string } | null>(null);
  const [verificationNote, setVerificationNote] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DoctorFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, debounced]);

  const query = useQuery({
    queryKey: ['admin', 'doctors', status, debounced, page],
    queryFn: () =>
      apiMeta<AdminDoctor[]>('/admin/doctors', {
        query: { status: status === 'all' ? undefined : status, search: debounced || undefined, page, limit: 12 },
      }),
    placeholderData: keepPreviousData,
  });

  const specialties = useQuery({
    queryKey: ['specialties'],
    queryFn: () => apiRequest<Specialty[]>('/doctors/specialties'),
    enabled: createOpen,
  });

  const clinics = useQuery({
    queryKey: ['admin', 'clinics'],
    queryFn: () => apiRequest<Clinic[]>('/admin/clinics'),
    enabled: createOpen,
  });

  const verify = useMutation({
    mutationFn: ({ id, nextStatus, note }: { id: string; nextStatus: string; note?: string }) =>
      apiRequest(`/admin/doctors/${id}/verification`, {
        method: 'PATCH',
        body: { status: nextStatus, note: note || undefined },
      }),
    onSuccess: () => {
      toast.success('Doctor verification updated');
      setVerifyTarget(null);
      setVerificationNote('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update verification'),
  });

  const createDoctor = useMutation({
    mutationFn: () =>
      apiRequest<{ id: string; email: string; temporaryPassword: string | null }>('/admin/doctors', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password || undefined,
          qualification: form.qualification.trim(),
          registrationNumber: form.registrationNumber.trim(),
          experienceYears: Number(form.experienceYears),
          consultationFee: Number(form.consultationFee),
          onlineConsultationFee: form.onlineConsultationFee ? Number(form.onlineConsultationFee) : undefined,
          biography: form.biography.trim() || undefined,
          specialtyIds: form.specialtyIds,
          clinicIds: form.clinicIds,
        },
      }),
    onSuccess: (result) => {
      toast.success('Doctor account created and marked pending verification');
      if (result.temporaryPassword) {
        setCreatedCredentials({ email: result.email, password: result.temporaryPassword });
      } else {
        setCreateOpen(false);
        setForm(EMPTY_FORM);
      }
      void queryClient.invalidateQueries({ queryKey: ['admin', 'doctors'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to create the doctor account');
    },
  });

  const doctors = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;
  const filtered = status !== 'all' || Boolean(debounced);

  function toggleFormList(key: 'specialtyIds' | 'clinicIds', id: string) {
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id],
    }));
  }

  function validateForm(): string {
    if (form.fullName.trim().length < 2) return 'Enter the doctor’s full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
    if (form.qualification.trim().length < 3) return 'Enter the doctor’s qualification.';
    if (form.registrationNumber.trim().length < 3) return 'Enter the medical registration number.';
    if (!form.specialtyIds.length) return 'Select at least one specialty.';
    if (!Number(form.consultationFee) || Number(form.consultationFee) < 100) return 'Consultation fee must be at least ₹100.';
    if (form.password && form.password.length < 8) return 'Password must be at least 8 characters.';
    return '';
  }

  function submitDoctor() {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }
    setFormError('');
    createDoctor.mutate();
  }

  function closeCreateDialog(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setForm(EMPTY_FORM);
      setFormError('');
      setCreatedCredentials(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Doctors"
        description="Verify clinical profiles, review performance and onboard new doctors."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Add doctor
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email or registration number"
              className="pl-9"
              aria-label="Search doctors"
            />
          </div>
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load the doctor directory." onRetry={() => void query.refetch()} />
      ) : doctors.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doctors.map((doctor) => (
                  <TableRow key={doctor.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                          <Stethoscope className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{doctor.fullName}</p>
                          <p className="truncate text-xs text-slate-500">
                            {doctor.specialty ?? 'General'} · {doctor.qualification}
                          </p>
                          <p className="truncate text-[11px] text-slate-400">{doctor.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">{doctor.registrationNumber}</p>
                      <p className="text-xs text-slate-400">{doctor.experienceYears} yrs experience</p>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-800">
                      {formatCurrency(doctor.consultationFee)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">{doctor.appointments} appointments</p>
                      <p className="text-xs text-slate-400">{formatCurrency(doctor.revenue)} collected</p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset',
                          VERIFICATION_STYLES[doctor.verificationStatus] ?? VERIFICATION_STYLES.pending,
                        )}
                      >
                        {doctor.verificationStatus}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-400">Joined {formatDate(doctor.createdAt)}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {doctor.verificationStatus !== 'verified' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => setVerifyTarget({ doctor, status: 'verified' })}
                          >
                            <UserCheck /> Verify
                          </Button>
                        )}
                        {doctor.verificationStatus === 'pending' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => setVerifyTarget({ doctor, status: 'rejected' })}
                          >
                            <XCircle /> Reject
                          </Button>
                        )}
                        {doctor.verificationStatus === 'verified' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500 hover:bg-slate-100"
                            onClick={() => setVerifyTarget({ doctor, status: 'suspended' })}
                          >
                            <Ban /> Suspend
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination
            page={pagination?.page ?? page}
            totalPages={pagination?.totalPages ?? 1}
            total={pagination?.total}
            onPageChange={setPage}
          />
        </>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No doctors found"
          description={filtered ? 'No doctor matches the selected status or search.' : 'Add your first doctor to start accepting appointments.'}
          action={
            filtered
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    setStatus('all');
                  },
                }
              : { label: 'Add doctor', onClick: () => setCreateOpen(true) }
          }
        />
      )}

      <Dialog open={Boolean(verifyTarget)} onOpenChange={(open) => { if (!open) { setVerifyTarget(null); setVerificationNote(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {verifyTarget?.status === 'verified' ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-500" />}
              {verifyTarget?.status === 'verified'
                ? 'Verify doctor'
                : verifyTarget?.status === 'suspended'
                  ? 'Suspend doctor'
                  : 'Reject doctor'}
            </DialogTitle>
            <DialogDescription>
              {verifyTarget?.doctor.fullName} will be notified of this decision. Add an optional note for their records.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="verification-note">Note (optional)</Label>
            <Textarea
              id="verification-note"
              className="mt-2"
              rows={3}
              maxLength={500}
              value={verificationNote}
              onChange={(event) => setVerificationNote(event.target.value)}
              placeholder="Reason or guidance for the doctor"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyTarget(null)}>Cancel</Button>
            <Button
              variant={verifyTarget?.status === 'verified' ? 'teal' : 'destructive'}
              loading={verify.isPending}
              onClick={() =>
                verifyTarget &&
                verify.mutate({
                  id: verifyTarget.doctor.id,
                  nextStatus: verifyTarget.status,
                  note: verificationNote,
                })
              }
            >
              {verifyTarget?.status === 'verified' ? 'Verify doctor' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          {createdCredentials ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-emerald-600" /> Doctor account created
                </DialogTitle>
                <DialogDescription>
                  Share these credentials securely with the doctor. The account is pending verification and cannot accept
                  bookings until verified.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</p>
                  <p className="mt-0.5 font-medium text-slate-900">{createdCredentials.email}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Temporary password</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="font-mono font-medium text-slate-900">{createdCredentials.password}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(createdCredentials.password).catch(() => undefined);
                        toast.success('Password copied');
                      }}
                    >
                      <Copy /> Copy
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => closeCreateDialog(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add a doctor</DialogTitle>
                <DialogDescription>
                  Create a clinical profile. Default weekday availability (09:00–17:00) is added automatically and can be
                  edited by the doctor later.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="doctor-name">Full name</Label>
                  <Input id="doctor-name" className="mt-2" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Dr. Ananya Rao" />
                </div>
                <div>
                  <Label htmlFor="doctor-email">Email</Label>
                  <Input id="doctor-email" className="mt-2" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="doctor@example.com" />
                </div>
                <div>
                  <Label htmlFor="doctor-phone">Phone (optional)</Label>
                  <Input id="doctor-phone" className="mt-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" />
                </div>
                <div>
                  <Label htmlFor="doctor-password">Temporary password (optional)</Label>
                  <Input id="doctor-password" className="mt-2" type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Generated if left blank" />
                </div>
                <div>
                  <Label htmlFor="doctor-qualification">Qualification</Label>
                  <Input id="doctor-qualification" className="mt-2" value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} placeholder="MBBS, MD (Cardiology)" />
                </div>
                <div>
                  <Label htmlFor="doctor-registration">Registration number</Label>
                  <Input id="doctor-registration" className="mt-2" value={form.registrationNumber} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} placeholder="KMC/12345" />
                </div>
                <div>
                  <Label htmlFor="doctor-experience">Experience (years)</Label>
                  <Input id="doctor-experience" className="mt-2" type="number" min={0} max={70} value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="doctor-fee">Consultation fee (₹)</Label>
                  <Input id="doctor-fee" className="mt-2" type="number" min={100} value={form.consultationFee} onChange={(event) => setForm({ ...form, consultationFee: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="doctor-online-fee">Online fee (₹, optional)</Label>
                  <Input id="doctor-online-fee" className="mt-2" type="number" min={0} value={form.onlineConsultationFee} onChange={(event) => setForm({ ...form, onlineConsultationFee: event.target.value })} placeholder="Defaults to 85% of clinic fee" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="doctor-bio">Biography (optional)</Label>
                  <Textarea id="doctor-bio" className="mt-2" rows={3} maxLength={2000} value={form.biography} onChange={(event) => setForm({ ...form, biography: event.target.value })} placeholder="Areas of expertise, approach to care and notable experience." />
                </div>

                <div className="sm:col-span-2">
                  <Label>Specialties</Label>
                  <div className="mt-2 grid max-h-40 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                    {specialties.isLoading ? (
                      <p className="text-xs text-slate-400">Loading specialties…</p>
                    ) : specialties.data?.length ? (
                      specialties.data.map((specialty) => (
                        <label key={specialty.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            checked={form.specialtyIds.includes(specialty.id)}
                            onChange={() => toggleFormList('specialtyIds', specialty.id)}
                          />
                          {specialty.name}
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No specialties available.</p>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <Label>Clinics (optional)</Label>
                  <div className="mt-2 grid max-h-32 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
                    {clinics.isLoading ? (
                      <p className="text-xs text-slate-400">Loading clinics…</p>
                    ) : clinics.data?.length ? (
                      clinics.data.map((clinic) => (
                        <label key={clinic.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            checked={form.clinicIds.includes(clinic.id)}
                            onChange={() => toggleFormList('clinicIds', clinic.id)}
                          />
                          {clinic.name} · {clinic.city}
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No clinics available.</p>
                    )}
                  </div>
                </div>
              </div>

              {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={() => closeCreateDialog(false)}>Cancel</Button>
                <Button loading={createDoctor.isPending} onClick={submitDoctor}>
                  <Plus /> Create doctor
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
