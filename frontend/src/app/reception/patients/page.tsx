'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy, Plus, Search, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiMeta, apiRequest } from '@/lib/api';
import type { PaginationMeta, PatientListItem } from '@/types';
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
import { formatDate } from '@/lib/utils';

interface WalkInForm {
  fullName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
}

const EMPTY_FORM: WalkInForm = {
  fullName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  address: '',
};

export default function ReceptionPatientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WalkInForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [registered, setRegistered] = useState<{ id: string; existed: boolean; temporaryPassword: string | null } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const query = useQuery({
    queryKey: ['reception', 'patients', debounced, page],
    queryFn: () =>
      apiMeta<PatientListItem[]>('/reception/patients', {
        query: { search: debounced || undefined, page, limit: 15 },
      }),
    placeholderData: keepPreviousData,
  });

  const register = useMutation({
    mutationFn: () =>
      apiRequest<{ id: string; profileId: string; existed: boolean; temporaryPassword: string | null }>('/reception/patients', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          address: form.address.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setRegistered(result);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ['reception', 'patients'] });
      toast.success(result.existed ? 'Patient already registered' : 'Patient registered');
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Unable to register patient'),
  });

  const patients = query.data?.data ?? [];
  const pagination = query.data?.meta.pagination as PaginationMeta | undefined;

  function submit() {
    if (form.fullName.trim().length < 2) {
      setFormError('Enter the patient’s full name.');
      return;
    }
    if (form.phone.trim().length < 10) {
      setFormError('Enter a valid phone number.');
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address or leave it blank.');
      return;
    }
    setFormError('');
    register.mutate();
  }

  function closeDialog(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(EMPTY_FORM);
      setFormError('');
      setRegistered(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Search the patient directory or register a walk-in patient."
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus /> Register walk-in
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or phone"
            className="pl-9"
            aria-label="Search patients"
          />
        </div>
      </Card>

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState description="We could not load the patient directory." onRetry={() => void query.refetch()} />
      ) : patients.length ? (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead>Last visit</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-800">{patient.fullName}</p>
                      <p className="text-xs text-slate-400">
                        {patient.gender ?? 'Gender not set'}
                        {patient.dateOfBirth ? ` · ${formatDate(patient.dateOfBirth)}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-700">{patient.phone ?? 'No phone'}</p>
                      <p className="text-xs text-slate-400">{patient.email}</p>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{patient.appointments}</TableCell>
                    <TableCell className="text-sm text-slate-600">{patient.lastVisit ? formatDate(patient.lastVisit) : '—'}</TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDate(patient.memberSince)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/reception/book?patientId=${patient.id}`}>
                          <CalendarPlus /> Book
                        </Link>
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
          icon={Users}
          title="No patients found"
          description={debounced ? 'No patient matches your search.' : 'Register a walk-in patient to get started.'}
          action={debounced ? { label: 'Clear search', onClick: () => setSearch('') } : { label: 'Register walk-in', onClick: () => setOpen(true) }}
        />
      )}

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          {registered ? (
            <>
              <DialogHeader>
                <DialogTitle>{registered.existed ? 'Patient already registered' : 'Patient registered'}</DialogTitle>
                <DialogDescription>
                  {registered.existed
                    ? 'This patient is already in the directory. Book their appointment now or close this dialog.'
                    : 'The patient record is ready. Share the temporary password if the patient wants online access.'}
                </DialogDescription>
              </DialogHeader>
              {registered.temporaryPassword && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Temporary password</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="font-mono font-medium text-slate-900">{registered.temporaryPassword}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(registered.temporaryPassword ?? '').catch(() => undefined);
                        toast.success('Password copied');
                      }}
                    >
                      <Copy /> Copy
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => closeDialog(false)}>Close</Button>
                <Button asChild>
                  <Link href={`/reception/book?patientId=${registered.id}`}>
                    <CalendarPlus /> Book appointment
                  </Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Register a walk-in patient</DialogTitle>
                <DialogDescription>
                  If the phone number or email already belongs to a patient, their existing record will be reused.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="walkin-name">Full name</Label>
                  <Input id="walkin-name" className="mt-2" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Patient full name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="walkin-phone">Phone</Label>
                    <Input id="walkin-phone" className="mt-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <Label htmlFor="walkin-email">Email (optional)</Label>
                    <Input id="walkin-email" className="mt-2" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="patient@example.com" />
                  </div>
                  <div>
                    <Label htmlFor="walkin-dob">Date of birth (optional)</Label>
                    <Input id="walkin-dob" className="mt-2" type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="walkin-gender">Gender (optional)</Label>
                    <Select value={form.gender} onValueChange={(value) => setForm({ ...form, gender: value })}>
                      <SelectTrigger id="walkin-gender" className="mt-2" aria-label="Gender">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="walkin-address">Address (optional)</Label>
                  <Textarea id="walkin-address" className="mt-2" rows={2} maxLength={300} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </div>
                {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => closeDialog(false)}>Cancel</Button>
                <Button loading={register.isPending} onClick={submit}>
                  <Plus /> Register patient
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
