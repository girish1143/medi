'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseMedical,
  CalendarClock,
  Clock3,
  GraduationCap,
  Languages,
  MapPin,
  Phone,
  Star,
  Stethoscope,
  Video,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { DoctorDetail } from '@/types';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RatingStars } from '@/components/shared/rating-stars';
import { ErrorState } from '@/components/shared/error-state';
import { formatCurrency, formatDate, formatDayLabel, formatTime, initials, WEEKDAYS } from '@/lib/utils';

export default function DoctorProfilePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const query = useQuery({
    queryKey: ['doctor', id],
    queryFn: () => apiRequest<DoctorDetail>(`/doctors/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1 surface-gradient">
          <div className="container-page py-10">
            <Skeleton className="h-64 rounded-3xl" />
            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
              <Skeleton className="h-96 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">
          <div className="container-page py-16">
            <ErrorState
              title="Doctor profile unavailable"
              description="This profile may have been removed or is no longer accepting appointments."
              onRetry={() => query.refetch()}
            />
            <div className="mt-6 text-center">
              <Button asChild variant="outline">
                <Link href="/doctors">
                  <ArrowLeft className="h-4 w-4" /> Back to all doctors
                </Link>
              </Button>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const doctor = query.data;
  const sortedHours = [...doctor.workingHours].sort((a, b) => a.weekday - b.weekday);
  const totalReviews = doctor.reviews.distribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 surface-gradient">
        <div className="container-page py-8 sm:py-10">
          <Link href="/doctors" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" /> All doctors
          </Link>

          <div className="mt-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <Avatar className="h-24 w-24 rounded-3xl sm:h-28 sm:w-28">
                {doctor.avatarUrl ? <AvatarImage src={doctor.avatarUrl} alt={doctor.fullName} /> : null}
                <AvatarFallback className="rounded-3xl bg-gradient-to-br from-blue-100 to-teal-100 text-3xl text-blue-700">
                  {initials(doctor.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{doctor.fullName}</h1>
                  <Badge variant="success" className="gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">{doctor.qualification}</p>
                <p className="mt-2 text-sm font-medium text-blue-600">
                  {doctor.primarySpecialty ?? doctor.specialties.join(', ')}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <BriefcaseMedical className="h-4 w-4 text-slate-400" /> {doctor.experienceYears} years experience
                  </span>
                  <RatingStars rating={doctor.rating} count={doctor.totalReviews} size="md" />
                  {doctor.languages.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Languages className="h-4 w-4 text-slate-400" /> {doctor.languages.join(', ')}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-slate-400" /> Reg. {doctor.registrationNumber}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {doctor.specialties.map((specialty) => (
                    <span key={specialty} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      {specialty}
                    </span>
                  ))}
                  {doctor.onlineConsultationFee !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
                      <Video className="h-3 w-3" /> Online consultations
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:w-52">
                <Button asChild size="lg" className="w-full">
                  <Link href={`/book/${doctor.id}`}>
                    <CalendarClock className="h-4 w-4" /> Book appointment
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/book/${doctor.id}?type=online`}>Book online consultation</Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>About {doctor.fullName}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {doctor.biography ??
                      `${doctor.fullName} is a verified ${doctor.primarySpecialty ?? 'specialist'} with ${doctor.experienceYears} years of clinical experience. Book an appointment to discuss your symptoms and treatment options.`}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-4 text-center">
                      <p className="text-lg font-bold text-slate-900">{doctor.experienceYears}+</p>
                      <p className="text-xs text-slate-500">Years experience</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 text-center">
                      <p className="text-lg font-bold text-slate-900">{doctor.stats.completedConsultations}</p>
                      <p className="text-xs text-slate-500">Consultations completed</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-4 text-center">
                      <p className="text-lg font-bold text-slate-900">{doctor.rating.toFixed(1)}</p>
                      <p className="text-xs text-slate-500">Average rating</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {doctor.clinics.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Clinics & locations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {doctor.clinics.map((clinic) => (
                      <div key={clinic.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <MapPin className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{clinic.name}</p>
                            {clinic.isPrimary && <Badge variant="secondary">Primary</Badge>}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{clinic.address}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{formatCurrency(clinic.consultationFee)} consultation</span>
                            {clinic.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {clinic.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Working hours</CardTitle>
                </CardHeader>
                <CardContent>
                  {sortedHours.length === 0 ? (
                    <p className="text-sm text-slate-500">Working hours are being updated. Please check availability on the booking page.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {sortedHours.map((hour) => (
                        <div key={`${hour.weekday}-${hour.startTime}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-700">{WEEKDAYS[hour.weekday]}</span>
                          <span className="text-slate-500">
                            {hour.startTime} – {hour.endTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Patient reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  {doctor.reviews.total === 0 ? (
                    <p className="text-sm text-slate-500">No reviews yet. Be the first to share your experience after your consultation.</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                        <div className="text-center sm:w-40">
                          <p className="text-4xl font-bold text-slate-900">{doctor.rating.toFixed(1)}</p>
                          <div className="mt-1 flex justify-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <Star
                                key={value}
                                className={`h-4 w-4 ${value <= Math.round(doctor.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                              />
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{totalReviews} verified reviews</p>
                        </div>
                        <div className="flex-1 space-y-1.5">
                          {doctor.reviews.distribution.map((item) => (
                            <div key={item.rating} className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="w-3">{item.rating}</span>
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-amber-400"
                                  style={{ width: `${totalReviews ? (item.count / totalReviews) * 100 : 0}%` }}
                                />
                              </div>
                              <span className="w-6 text-right">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-6 space-y-4">
                        {doctor.reviews.items.map((review) => (
                          <div key={review.id} className="rounded-xl border border-slate-100 p-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-900">{review.patientName}</p>
                              <RatingStars rating={review.rating} />
                            </div>
                            {review.comment && <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.comment}</p>}
                            <p className="mt-2 text-xs text-slate-400">
                              {formatDate(review.createdAt)} · {review.appointmentNumber}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-4">
              <Card className="sticky top-24 overflow-hidden">
                <div className="bg-gradient-to-br from-blue-600 to-teal-600 px-5 py-5 text-white">
                  <p className="text-xs font-medium uppercase tracking-wider text-blue-100">Consultation fee</p>
                  <p className="mt-1 text-3xl font-bold">{formatCurrency(doctor.consultationFee)}</p>
                  {doctor.onlineConsultationFee !== null && (
                    <p className="mt-1 text-xs text-blue-100">Video consultation {formatCurrency(doctor.onlineConsultationFee)}</p>
                  )}
                </div>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-start gap-2.5 text-sm">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Next available</p>
                      <p className="text-slate-500">
                        {doctor.nextAvailableAt
                          ? `${formatDayLabel(doctor.nextAvailableAt)} at ${formatTime(doctor.nextAvailableAt)}`
                          : 'Select a date to see openings'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Location</p>
                      <p className="text-slate-500">
                        {doctor.clinic ? `${doctor.clinic.name}, ${doctor.clinic.city}` : 'Online consultation'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm">
                    <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">Specialty</p>
                      <p className="text-slate-500">{doctor.primarySpecialty ?? doctor.specialties.join(', ')}</p>
                    </div>
                  </div>
                  <Button asChild size="lg" className="w-full">
                    <Link href={`/book/${doctor.id}`}>Choose a time</Link>
                  </Button>
                  <p className="text-center text-xs text-slate-400">
                    Free cancellation up to the clinic&apos;s policy window
                  </p>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
