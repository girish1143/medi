import { Suspense } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { DoctorsBrowser } from '@/components/doctors/doctors-browser';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = {
  title: 'Find doctors',
  description: 'Browse verified doctors by specialty, city, fee and rating. Book in-clinic or online consultations.',
};

export default function DoctorsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 surface-gradient">
        <Suspense
          fallback={
            <div className="container-page py-12">
              <Skeleton className="h-10 w-80" />
              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-80 rounded-2xl" />
                ))}
              </div>
            </div>
          }
        >
          <DoctorsBrowser />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
