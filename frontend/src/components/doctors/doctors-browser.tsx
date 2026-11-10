'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { apiMeta, apiRequest } from '@/lib/api';
import type { DoctorSummary, PaginationMeta, Specialty } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DoctorCard } from '@/components/shared/doctor-card';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';

export function DoctorsBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  const filters = useMemo(
    () => ({
      q: searchParams.get('q') ?? '',
      specialty: searchParams.get('specialty') ?? '',
      city: searchParams.get('city') ?? '',
      consultationType: searchParams.get('consultationType') ?? '',
      maxFee: searchParams.get('maxFee') ?? '',
      minRating: searchParams.get('minRating') ?? '',
      availableToday: searchParams.get('availableToday') ?? '',
      sort: searchParams.get('sort') ?? 'rating',
      page: Number(searchParams.get('page') ?? '1'),
    }),
    [searchParams],
  );

  const specialties = useQuery({
    queryKey: ['specialties'],
    queryFn: () => apiRequest<Specialty[]>('/doctors/specialties'),
  });

  const doctors = useQuery({
    queryKey: ['doctors', 'search', filters],
    queryFn: () =>
      apiMeta<DoctorSummary[]>('/doctors', {
        query: {
          q: filters.q || undefined,
          specialty: filters.specialty || undefined,
          city: filters.city || undefined,
          consultationType: filters.consultationType || undefined,
          maxFee: filters.maxFee || undefined,
          minRating: filters.minRating || undefined,
          availableToday: filters.availableToday || undefined,
          sort: filters.sort || undefined,
          page: filters.page,
          limit: 9,
        },
      }),
  });

  const pagination = doctors.data?.meta.pagination as PaginationMeta | undefined;

  function updateFilters(patch: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '' || value === null) params.delete(key);
      else params.set(key, String(value));
    }
    if (!('page' in patch)) params.delete('page');
    router.replace(`/doctors${params.size ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((searchParams.get('q') ?? '') !== search) updateFilters({ q: search });
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeFilterCount = ['specialty', 'city', 'consultationType', 'maxFee', 'minRating', 'availableToday'].filter(
    (key) => searchParams.get(key),
  ).length;
  const currentSpecialtyLabel =
    specialties.data?.find((item) => item.slug === filters.specialty)?.name ?? 'All specialties';

  const filterPanel = (
    <div className="space-y-5">
      <div>
        <Label className="mb-2 block">Specialty</Label>
        <Select
          value={filters.specialty || 'all'}
          onValueChange={(value) => updateFilters({ specialty: value === 'all' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All specialties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specialties</SelectItem>
            {(specialties.data ?? []).map((item) => (
              <SelectItem key={item.id} value={item.slug}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">City or area</Label>
        <Input
          defaultValue={filters.city}
          placeholder="e.g. Bengaluru"
          onKeyDown={(event) => {
            if (event.key === 'Enter') updateFilters({ city: (event.target as HTMLInputElement).value });
          }}
          onBlur={(event) => updateFilters({ city: event.target.value })}
        />
      </div>

      <div>
        <Label className="mb-2 block">Consultation type</Label>
        <Select
          value={filters.consultationType || 'all'}
          onValueChange={(value) => updateFilters({ consultationType: value === 'all' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any type</SelectItem>
            <SelectItem value="in_clinic">In-clinic</SelectItem>
            <SelectItem value="online">Online video</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">Maximum fee</Label>
        <Select
          value={filters.maxFee || 'any'}
          onValueChange={(value) => updateFilters({ maxFee: value === 'any' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any fee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any fee</SelectItem>
            <SelectItem value="500">Up to ₹500</SelectItem>
            <SelectItem value="800">Up to ₹800</SelectItem>
            <SelectItem value="1000">Up to ₹1,000</SelectItem>
            <SelectItem value="1500">Up to ₹1,500</SelectItem>
            <SelectItem value="2500">Up to ₹2,500</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2 block">Minimum rating</Label>
        <Select
          value={filters.minRating || 'any'}
          onValueChange={(value) => updateFilters({ minRating: value === 'any' ? undefined : value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Any rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any rating</SelectItem>
            <SelectItem value="4.5">4.5 and above</SelectItem>
            <SelectItem value="4">4.0 and above</SelectItem>
            <SelectItem value="3.5">3.5 and above</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={filters.availableToday === 'true'}
          onChange={(event) => updateFilters({ availableToday: event.target.checked ? 'true' : undefined })}
        />
        Available today
      </label>

      <Button
        variant="ghost"
        className="w-full text-slate-500"
        onClick={() =>
          router.replace('/doctors', { scroll: false })
        }
      >
        <X className="h-4 w-4" /> Clear all filters
      </Button>
    </div>
  );

  return (
    <div className="container-page py-10 sm:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Find a doctor</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Book a verified specialist
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {currentSpecialtyLabel} · Transparent fees · Real-time availability
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-card sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 px-2">
          <Search className="h-5 w-5 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by doctor name, qualification or condition"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="Search doctors"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="lg:hidden"
            onClick={() => setShowFilters((value) => !value)}
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>
            )}
          </Button>
          <Select value={filters.sort} onValueChange={(value) => updateFilters({ sort: value })}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Top rated</SelectItem>
              <SelectItem value="next_available">Next available</SelectItem>
              <SelectItem value="fee_asc">Fee: low to high</SelectItem>
              <SelectItem value="fee_desc">Fee: high to low</SelectItem>
              <SelectItem value="experience">Most experienced</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="h-4 w-4 text-blue-600" /> Filters
            </div>
            {filterPanel}
          </div>
        </aside>

        {showFilters && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card lg:hidden">{filterPanel}</div>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {doctors.isLoading ? 'Searching doctors…' : `${pagination?.total ?? doctors.data?.data.length ?? 0} doctors found`}
            </p>
            {doctors.isFetching && !doctors.isLoading && <span className="text-xs text-blue-600">Updating…</span>}
          </div>

          {doctors.isLoading && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-80 rounded-2xl" />
              ))}
            </div>
          )}

          {doctors.isError && (
            <ErrorState
              title="Could not load doctors"
              description="Please check your connection or try again."
              onRetry={() => doctors.refetch()}
            />
          )}

          {!doctors.isLoading && !doctors.isError && !doctors.data?.data.length && (
            <EmptyState
              icon={Search}
              title="No doctors match your filters"
              description="Try removing a filter, searching a different specialty, or clearing the search term."
              action={{ label: 'Clear filters', onClick: () => router.replace('/doctors') }}
            />
          )}

          {!doctors.isLoading && !doctors.isError && doctors.data && doctors.data.data.length > 0 && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {doctors.data.data.map((doctor) => (
                  <DoctorCard key={doctor.id} doctor={doctor} />
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={filters.page <= 1}
                    onClick={() => updateFilters({ page: filters.page - 1 })}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-3 text-sm text-slate-600">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={filters.page >= pagination.totalPages}
                    onClick={() => updateFilters({ page: filters.page + 1 })}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
