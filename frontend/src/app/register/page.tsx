import Link from 'next/link';
import { Building2, Stethoscope, UserRound } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';

const REGISTRATION_OPTIONS = [
  {
    href: '/register/patient',
    title: 'Patient Account',
    description: 'Submit healthcare enquiries and manage provider contact consent.',
    icon: UserRound,
    badge: 'Activates after email verification',
  },
  {
    href: '/register/doctor',
    title: 'Doctor / Specialist',
    description: 'Connect with verified patient leads matching your specialization.',
    icon: Stethoscope,
    badge: 'Requires administrator credential verification',
  },
  {
    href: '/register/hospital',
    title: 'Hospital / Clinic Facility',
    description: 'Receive qualified specialty referrals for your medical departments.',
    icon: Building2,
    badge: 'Requires administrator facility verification',
  },
] as const;

export default function RegisterRoleSelectorPage() {
  return (
    <AuthShell
      title="Create an account"
      subtitle="Select the account type that matches your role on the platform."
      footer={
        <p>
          Already registered?{' '}
          <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="space-y-3.5">
        {REGISTRATION_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Link
              key={option.href}
              href={option.href}
              className="flex items-start gap-3.5 rounded-xl border border-slate-200 p-4 transition hover:border-teal-600 hover:bg-teal-50/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{option.description}</p>
                <p className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                  {option.badge}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </AuthShell>
  );
}
