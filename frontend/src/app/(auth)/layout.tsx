import Link from 'next/link';
import { CalendarCheck2, FileLock2, ShieldCheck, Stethoscope } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-teal-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-20 hero-grid" aria-hidden />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Stethoscope className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight">
              Medi<span className="text-teal-200">Book</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Healthcare that fits around your life.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-blue-100">
            Book verified specialists, keep prescriptions and reports together, and manage every appointment from one
            calm dashboard.
          </p>
          <div className="mt-8 space-y-4">
            {[
              { icon: CalendarCheck2, title: 'Real-time availability', body: 'Choose a slot that is genuinely free.' },
              { icon: ShieldCheck, title: 'Secure payments', body: 'Verified Razorpay transactions with transparent refunds.' },
              { icon: FileLock2, title: 'Private health records', body: 'Only you and your treating doctor get access.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <item.icon className="h-5 w-5 text-teal-200" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs text-blue-100">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-blue-200">© {new Date().getFullYear()} MediBook Health Technologies Pvt. Ltd.</p>
      </div>

      <div className="flex flex-col bg-white">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-blue-600">
            Back to home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 pt-4 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
