'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Building2, Save, ShieldAlert, Star } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { DoctorDetail } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate, titleCase } from '@/lib/utils';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80),
  qualification: z.string().trim().min(3, 'Enter your qualification').max(160),
  experienceYears: z.coerce.number().int().min(0).max(70),
  biography: z.string().trim().max(2000).optional(),
  consultationFee: z.coerce.number().min(0).max(100000),
  onlineConsultationFee: z.coerce.number().min(0).max(100000).optional(),
  languages: z.string().trim().max(200).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function DoctorProfilePage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['doctor', 'profile'],
    queryFn: () => apiRequest<DoctorDetail>('/doctor-portal/profile'),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      qualification: '',
      experienceYears: 0,
      biography: '',
      consultationFee: 0,
      onlineConsultationFee: 0,
      languages: '',
    },
  });

  useEffect(() => {
    if (!query.data) return;
    form.reset({
      fullName: query.data.fullName,
      qualification: query.data.qualification,
      experienceYears: query.data.experienceYears,
      biography: query.data.biography ?? '',
      consultationFee: query.data.consultationFee,
      onlineConsultationFee: query.data.onlineConsultationFee ?? 0,
      languages: query.data.languages.join(', '),
    });
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest<DoctorDetail>('/doctor-portal/profile', {
        method: 'PATCH',
        body: {
          fullName: values.fullName,
          qualification: values.qualification,
          experienceYears: values.experienceYears,
          biography: values.biography || undefined,
          consultationFee: values.consultationFee,
          onlineConsultationFee: values.onlineConsultationFee ?? null,
          languages: values.languages
            ? values.languages.split(',').map((language) => language.trim()).filter(Boolean)
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Profile updated');
      void queryClient.invalidateQueries({ queryKey: ['doctor', 'profile'] });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update profile'),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ErrorState description="We could not load your profile." onRetry={() => void query.refetch()} />;
  }

  const profile = query.data;

  return (
    <div>
      <PageHeader
        title="My profile"
        description="This information appears on your public MediBook profile. Keep it accurate and patient-friendly."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Professional details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" className="mt-2" {...form.register('fullName')} />
                  {form.formState.errors.fullName && <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.fullName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="qualification">Qualification</Label>
                  <Input id="qualification" className="mt-2" {...form.register('qualification')} />
                  {form.formState.errors.qualification && <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.qualification.message}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="experienceYears">Years of experience</Label>
                  <Input id="experienceYears" type="number" min={0} max={70} className="mt-2" {...form.register('experienceYears')} />
                </div>
                <div>
                  <Label htmlFor="languages">Languages</Label>
                  <Input id="languages" className="mt-2" placeholder="English, Hindi, Marathi" {...form.register('languages')} />
                  <p className="mt-1.5 text-xs text-slate-400">Separate languages with commas.</p>
                </div>
              </div>

              <div>
                <Label htmlFor="biography">About you</Label>
                <Textarea
                  id="biography"
                  rows={4}
                  className="mt-2"
                  placeholder="Your approach to care, areas of expertise and notable experience."
                  {...form.register('biography')}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="consultationFee">In-clinic consultation fee (₹)</Label>
                  <Input id="consultationFee" type="number" min={0} className="mt-2" {...form.register('consultationFee')} />
                  {form.formState.errors.consultationFee && <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.consultationFee.message}</p>}
                </div>
                <div>
                  <Label htmlFor="onlineConsultationFee">Online consultation fee (₹)</Label>
                  <Input id="onlineConsultationFee" type="number" min={0} className="mt-2" {...form.register('onlineConsultationFee')} />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={save.isPending}>
                  <Save /> Save profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Profile status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {profile.verifiedAt ? (
                  <BadgeCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                )}
                <span className="font-medium text-slate-800">
                  {profile.verifiedAt ? 'Verified doctor' : 'Verification pending'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                {profile.verifiedAt
                  ? `Verified on ${formatDate(profile.verifiedAt)}.`
                  : 'Our admin team reviews registration details before your profile goes live.'}
              </p>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Registration number</p>
                <p className="font-mono text-sm font-semibold text-slate-800">{profile.registrationNumber}</p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-amber-800">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {profile.rating ? profile.rating.toFixed(1) : 'New'}
                </span>
                <span className="text-xs">{profile.totalReviews} reviews</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Specialties</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {profile.specialties.map((specialty) => (
                <Badge key={specialty} variant="teal">
                  {specialty}
                </Badge>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" /> Clinics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.clinics.length ? (
                profile.clinics.map((clinic) => (
                  <div key={clinic.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <p className="font-semibold text-slate-800">{clinic.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{clinic.address}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatCurrency(clinic.consultationFee)} · {clinic.isPrimary ? 'Primary' : 'Additional'}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No clinics assigned. Contact admin to add a clinic.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Consultation summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p className="flex justify-between"><span>Completed</span><span className="font-semibold text-slate-900">{profile.stats.completedConsultations}</span></p>
              <p className="flex justify-between"><span>Total appointments</span><span className="font-semibold text-slate-900">{profile.stats.totalAppointments}</span></p>
              <p className="flex justify-between"><span>Primary specialty</span><span className="font-semibold text-slate-900">{profile.primarySpecialty ?? titleCase('general')}</span></p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
