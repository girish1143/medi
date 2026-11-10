import Link from 'next/link';
import {
  BadgeCheck,
  CalendarCheck2,
  FileLock2,
  HeartHandshake,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'About MediBook',
  description: 'Learn how MediBook makes booking and managing healthcare simpler for patients, doctors and clinics.',
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="surface-gradient py-16 sm:py-20">
          <div className="container-page max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
              <Sparkles className="h-3 w-3" /> Our mission
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Healthcare that respects your time
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              MediBook was built to remove the friction between people and the care they need. We bring verified
              doctors, transparent pricing, reliable schedules and secure records into one calm experience.
            </p>
          </div>
        </section>

        <section className="container-page py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: BadgeCheck, title: 'Verified clinicians', body: 'Every doctor profile is reviewed by our clinical operations team before going live.' },
              { icon: CalendarCheck2, title: 'Reliable schedules', body: 'Database-enforced slot locking means the appointment you book is genuinely yours.' },
              { icon: LockKeyhole, title: 'Privacy first', body: 'Role-based access controls limit clinical data to you and your treating doctor.' },
              { icon: HeartHandshake, title: 'Human support', body: 'A real support team handles refunds, rescheduling and complaints with care.' },
            ].map((value) => (
              <div key={value.title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <value.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-sm font-semibold text-slate-900">{value.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{value.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">How it works</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Designed around the patient journey
              </h2>
              <div className="mt-6 space-y-5">
                {[
                  { icon: Stethoscope, title: 'Search with confidence', body: 'Filter by specialty, city, fee, rating and online availability. See real next-available slots.' },
                  { icon: CalendarCheck2, title: 'Book securely', body: 'Choose a slot, pay online through Razorpay or reserve with pay-at-clinic, and receive instant confirmation.' },
                  { icon: Users, title: 'Consult your way', body: 'Visit the clinic or join an online consultation. Your doctor has the context they need.' },
                  { icon: FileLock2, title: 'Keep your records', body: 'Prescriptions, invoices and uploaded reports stay available in your private dashboard.' },
                ].map((step, index) => (
                  <div key={step.title} className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8" id="security">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-xl font-bold text-slate-900">Security and privacy</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
                <li>• Passwords in production are handled by Supabase Auth; MediBook never stores plaintext credentials.</li>
                <li>• Access tokens live in httpOnly, SameSite cookies and are verified on every API request.</li>
                <li>• Row Level Security policies enforce database-level access boundaries.</li>
                <li>• Payment signatures and webhooks are verified server-side; the browser is never trusted.</li>
                <li>• Clinical files are private and shared only through short-lived signed URLs.</li>
              </ul>
              <Button asChild variant="outline" className="mt-6 bg-white">
                <Link href="/doctors">Find a verified doctor</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container-page py-16" id="contact">
          <div className="rounded-3xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-teal-50 p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Talk to the MediBook team</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
              Questions about booking, refunds or onboarding your clinic? We are here Monday to Saturday, 9 AM to 7 PM
              IST.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild>
                <a href="mailto:support@medibook.in">Email support</a>
              </Button>
              <Button asChild variant="outline" className="bg-white">
                <a href="tel:+918040001200">Call +91 80 4000 1200</a>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
