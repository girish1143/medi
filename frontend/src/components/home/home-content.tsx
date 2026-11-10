'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRoundCheck,
  Video,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { DoctorSummary, Specialty } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DoctorCard } from '@/components/shared/doctor-card';
import { specialtyIcon } from '@/lib/specialty-icons';

export function HomeContent() {
  const router = useRouter();
  const [specialty, setSpecialty] = useState('');
  const [city, setCity] = useState('');

  const specialties = useQuery({
    queryKey: ['specialties'],
    queryFn: () => apiRequest<Specialty[]>('/doctors/specialties'),
  });

  const doctors = useQuery({
    queryKey: ['doctors', 'featured'],
    queryFn: () => apiRequest<DoctorSummary[]>('/doctors', { query: { limit: 3, sort: 'rating' } }),
  });

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (specialty) params.set('specialty', specialty);
    if (city) params.set('city', city);
    router.push(`/doctors${params.size ? `?${params.toString()}` : ''}`);
  }

  return (
    <>
      <section className="relative overflow-hidden surface-gradient">
        <div className="pointer-events-none absolute inset-0 hero-grid" aria-hidden />
        <div className="container-page relative grid gap-12 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="animate-slide-up">
            <Badge variant="teal" className="gap-1.5 rounded-full px-3 py-1 text-xs">
              <BadgeCheck className="h-3.5 w-3.5" /> Verified doctors across India
            </Badge>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[56px]">
              Book the right doctor,
              <span className="text-gradient"> without the wait.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Real-time availability, transparent consultation fees and instant confirmation. Book in-clinic or
              online consultations with specialists you can trust.
            </p>

            <form
              onSubmit={handleSearch}
              className="mt-8 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-soft backdrop-blur-sm sm:flex sm:items-center sm:gap-2"
            >
              <div className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
                <Stethoscope className="h-5 w-5 shrink-0 text-blue-500" />
                <select
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none"
                  aria-label="Specialty"
                >
                  <option value="">All specialties</option>
                  {(specialties.data ?? []).map((item) => (
                    <option key={item.id} value={item.slug}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hidden h-8 w-px bg-slate-200 sm:block" />
              <div className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2">
                <Search className="h-5 w-5 shrink-0 text-blue-500" />
                <Input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City or area"
                  className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  aria-label="City"
                />
              </div>
              <Button type="submit" size="lg" className="mt-2 w-full rounded-xl sm:mt-0 sm:w-auto">
                <Search className="h-4 w-4" /> Find doctors
              </Button>
            </form>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-500" /> Free cancellation window
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-500" /> Instant digital prescriptions
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-500" /> Secure Razorpay payments
              </span>
            </div>
          </div>

          <div className="relative animate-fade-in">
            <div className="relative rounded-3xl border border-white/80 bg-white/90 p-6 shadow-soft backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Next available</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">Today, 4:30 PM</p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <CalendarClock className="h-5 w-5" />
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {(doctors.data ?? []).slice(0, 2).map((doctor) => (
                  <Link
                    key={doctor.id}
                    href={`/doctors/${doctor.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-blue-200 hover:bg-white"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-teal-100 text-sm font-semibold text-blue-700">
                        {doctor.fullName.replace(/^Dr\.?\s*/i, '').slice(0, 1)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{doctor.fullName}</p>
                        <p className="truncate text-xs text-slate-500">{doctor.primarySpecialty ?? 'Specialist'}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 ring-1 ring-slate-200">
                      ₹{doctor.consultationFee}
                    </span>
                  </Link>
                ))}
                {doctors.isLoading &&
                  [0, 1].map((item) => <Skeleton key={item} className="h-16 w-full rounded-2xl" />)}
                {!doctors.isLoading && !doctors.data?.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    Verified doctors are being onboarded. Check back shortly.
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Your care, organised</p>
                  <FileText className="h-4 w-4 opacity-80" />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-blue-50">
                  Prescriptions, lab reports and invoices stay together in your secure MediBook account.
                </p>
              </div>
            </div>

            <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:flex sm:items-center sm:gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-900">Private by design</p>
                <p className="text-[11px] text-slate-500">Role-based access to records</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page -mt-2 grid grid-cols-2 gap-4 py-10 sm:grid-cols-4">
        {[
          { value: '150+', label: 'Verified specialists' },
          { value: '20+', label: 'Specialties' },
          { value: '4.8/5', label: 'Average consultation rating' },
          { value: '30 min', label: 'Average booking time' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200/70 bg-white p-5 text-center shadow-card">
            <p className="text-2xl font-bold tracking-tight text-slate-900">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="container-page py-14">
        <SectionHeading
          eyebrow="Specialties"
          title="Care for every part of your health"
          description="Browse experienced specialists across cardiology, dermatology, pediatrics, orthopedics and more."
          href="/specialties"
        />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {specialties.isLoading &&
            Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
          {(specialties.data ?? []).slice(0, 8).map((item) => {
            const Icon = specialtyIcon(item.slug);
            return (
              <Link
                key={item.id}
                href={`/doctors?specialty=${item.slug}`}
                className="group rounded-2xl border border-slate-200/80 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-card"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-900">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.doctorCount} doctors</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-page">
          <SectionHeading
            eyebrow="Top rated"
            title="Meet a few of our specialists"
            description="Every doctor on MediBook is credential-verified before their profile goes live."
            href="/doctors"
          />
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {doctors.isLoading &&
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-80 rounded-2xl" />)}
            {(doctors.data ?? []).map((doctor) => (
              <DoctorCard key={doctor.id} doctor={doctor} />
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16" id="how-it-works">
        <SectionHeading
          eyebrow="How it works"
          title="Three simple steps to your consultation"
          description="From finding the right specialist to receiving your prescription — everything happens in one place."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Search,
              title: 'Find your doctor',
              body: 'Search by specialty, city, fee or rating. Compare verified profiles and real availability.',
            },
            {
              icon: CalendarCheck2,
              title: 'Pick a time that works',
              body: 'Choose an in-clinic or video slot. Your appointment is held securely while you complete payment.',
            },
            {
              icon: Video,
              title: 'Consult and follow up',
              body: 'Visit the clinic or join online. Get digital prescriptions, records and invoices instantly.',
            },
          ].map((step, index) => (
            <div key={step.title} className="relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
              <span className="absolute right-5 top-4 text-3xl font-bold text-slate-100">0{index + 1}</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <step.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Badge variant="default" className="rounded-full">
              <Sparkles className="h-3 w-3" /> Built for better care
            </Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              A calmer, clearer healthcare experience
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              MediBook handles the operational complexity — scheduling, payments, records and follow-ups — so doctors
              can focus on patients and patients can focus on getting better.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {[
                { icon: Clock3, title: 'Real-time slots', body: 'Database-level locking prevents double bookings.' },
                { icon: LockKeyhole, title: 'Private records', body: 'Only you and your treating doctor can view clinical files.' },
                { icon: CreditCard, title: 'Secure payments', body: 'Razorpay orders, verified signatures and webhooks.' },
                { icon: UserRoundCheck, title: 'Role-based access', body: 'Patients, doctors, admins and front-desk staff each see only what they should.' },
              ].map((feature) => (
                <div key={feature.title} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                  <p className="mt-2 text-sm font-semibold text-slate-900">{feature.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-teal-600 p-8 text-white shadow-soft">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">For patients</p>
            <h3 className="mt-3 text-2xl font-bold">Your health record, always with you</h3>
            <ul className="mt-6 space-y-4 text-sm text-blue-50">
              {[
                'Prescriptions with dosage instructions in one place',
                'Lab reports and imaging securely stored',
                'Downloadable invoices for insurance claims',
                'Reminders before every appointment',
                'Transparent refunds when plans change',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild variant="secondary" className="mt-7 w-full bg-white text-blue-700 hover:bg-blue-50">
              <Link href="/register">
                Create your free account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-teal-50 p-8 text-center sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Ready to see a doctor?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
            Book a verified specialist in minutes. Pay online or at the clinic, and manage everything from your
            MediBook dashboard.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/doctors">Find a doctor <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-white">
              <Link href="/about">Learn how MediBook works</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-base">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
