'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, Mail, MapPin, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import type { PatientProfile } from '@/types';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/utils';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^[6-9]\d{9}$/.test(value.replace(/[\s()+-]/g, '').replace(/^91/, '')), {
      message: 'Enter a valid 10-digit Indian mobile number',
    }),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say', '']).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']).optional(),
  emergencyContact: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function PatientProfilePage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['patient', 'profile'],
    queryFn: () => apiRequest<PatientProfile>('/patients/me'),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      dateOfBirth: '',
      gender: '',
      bloodGroup: '',
      emergencyContact: '',
      address: '',
    },
  });

  useEffect(() => {
    if (!query.data) return;
    form.reset({
      fullName: query.data.fullName,
      phone: query.data.phone ?? '',
      dateOfBirth: query.data.dateOfBirth ?? '',
      gender: (query.data.gender as FormValues['gender']) ?? '',
      bloodGroup: (query.data.bloodGroup as FormValues['bloodGroup']) ?? '',
      emergencyContact: query.data.emergencyContact ?? '',
      address: query.data.address ?? '',
    });
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      apiRequest<PatientProfile>('/patients/me', {
        method: 'PATCH',
        body: {
          fullName: values.fullName,
          phone: values.phone || null,
          dateOfBirth: values.dateOfBirth || null,
          gender: values.gender || null,
          bloodGroup: values.bloodGroup || null,
          emergencyContact: values.emergencyContact || null,
          address: values.address || undefined,
        },
      }),
    onSuccess: (profile) => {
      toast.success('Profile updated');
      queryClient.setQueryData(['patient', 'profile'], profile);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['patient', 'dashboard'] });
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
        description="Keep your contact and medical details up to date so your doctor has the right information."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" className="mt-2" {...form.register('fullName')} />
                  {form.formState.errors.fullName && (
                    <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.fullName.message}</p>
                  )}
                </div>
                <div>
                  <Label>Email address</Label>
                  <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                    <Mail className="h-4 w-4" /> <span className="truncate">{profile.email}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">Contact support to change your email.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="phone">Mobile number</Label>
                  <Input id="phone" type="tel" className="mt-2" placeholder="98765 43210" {...form.register('phone')} />
                  {form.formState.errors.phone && (
                    <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input id="dateOfBirth" type="date" className="mt-2" {...form.register('dateOfBirth')} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Gender</Label>
                  <Select
                    value={form.watch('gender') || 'none'}
                    onValueChange={(value) =>
                      form.setValue('gender', (value === 'none' ? '' : value) as FormValues['gender'], { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Prefer not to say</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Blood group</Label>
                  <Select
                    value={form.watch('bloodGroup') || 'none'}
                    onValueChange={(value) =>
                      form.setValue('bloodGroup', (value === 'none' ? '' : value) as FormValues['bloodGroup'], { shouldDirty: true })
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not known</SelectItem>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="emergencyContact">Emergency contact</Label>
                  <Input id="emergencyContact" className="mt-2" placeholder="Name and phone number" {...form.register('emergencyContact')} />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Textarea id="address" rows={2} className="mt-2" placeholder="House, street, area, city" {...form.register('address')} />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={save.isPending}>
                  <Save /> Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <CalendarDays className="h-4 w-4 text-slate-400" /> Member since {formatDate(profile.memberSince)}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <UserRound className="h-4 w-4 text-slate-400" /> Patient ID {profile.id.slice(0, 8).toUpperCase()}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> Records are private to you and your doctor
              </div>
            </CardContent>
          </Card>

          {profile.addresses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Saved addresses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.addresses.map((address) => (
                  <div key={address.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-slate-800">
                      <MapPin className="h-4 w-4 text-blue-500" /> {address.label}
                      {address.isDefault && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">Default</span>}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.pincode}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
