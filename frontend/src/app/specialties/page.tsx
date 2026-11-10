'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { Specialty } from '@/types';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { specialtyIcon } from '@/lib/specialty-icons';

export default function SpecialtiesPage() {
  const query = useQuery({
    queryKey: ['specialties'],
    queryFn: () => apiRequest<Specialty[]>('/doctors/specialties'),
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 surface-gradient">
        <div className="container-page py-12 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Specialties</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Find the right specialist for your concern
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Browse our verified specialties and compare doctors by experience, rating and consultation fee.
            </p>
          </div>

          <div className="mt-8">
            {query.isLoading && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <Skeleton key={index} className="h-40 rounded-2xl" />
                ))}
              </div>
            )}
            {query.isError && <ErrorState onRetry={() => query.refetch()} />}
            {!query.isLoading && !query.isError && !query.data?.length && (
              <EmptyState icon={Stethoscope} title="No specialties available yet" description="Please check back shortly." />
            )}
            {!query.isLoading && !query.isError && query.data && query.data.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {query.data.map((specialty) => {
                  const Icon = specialtyIcon(specialty.slug);
                  return (
                    <Link
                      key={specialty.id}
                      href={`/doctors?specialty=${specialty.slug}`}
                      className="group rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-soft"
                    >
                      <div className="flex items-start justify-between">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                          <Icon className="h-6 w-6" />
                        </span>
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200/60">
                          {specialty.doctorCount} doctors
                        </span>
                      </div>
                      <h2 className="mt-4 text-base font-semibold text-slate-900">{specialty.name}</h2>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">
                        {specialty.description ?? 'Consult experienced specialists for diagnosis, treatment and follow-up care.'}
                      </p>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
                        View doctors <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
