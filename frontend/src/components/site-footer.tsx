import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '@/components/logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            MediBook connects patients with verified doctors across India. Book in-clinic or online consultations,
            manage prescriptions and keep your health records secure in one place.
          </p>
          <div className="mt-5 space-y-2 text-sm text-slate-500">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-500" /> Bengaluru, Karnataka, India
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-blue-500" /> +91 80 4000 1200
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-blue-500" /> support@medibook.in
            </p>
          </div>
        </div>
        <FooterColumn
          title="Patients"
          links={[
            { href: '/doctors', label: 'Find a doctor' },
            { href: '/specialties', label: 'Specialties' },
            { href: '/register', label: 'Create account' },
            { href: '/login', label: 'Patient sign in' },
          ]}
        />
        <FooterColumn
          title="For clinicians"
          links={[
            { href: '/register', label: 'Join MediBook' },
            { href: '/about', label: 'How it works' },
            { href: '/login', label: 'Doctor sign in' },
          ]}
        />
        <FooterColumn
          title="Company"
          links={[
            { href: '/about', label: 'About us' },
            { href: '/about#security', label: 'Security' },
            { href: '/about#contact', label: 'Contact' },
          ]}
        />
      </div>
      <div className="border-t border-slate-100">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} MediBook Health Technologies Pvt. Ltd. All rights reserved.</p>
          <p>Made for better healthcare in India · Payments secured by Razorpay</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ href: string; label: string }> }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link href={link.href} className="text-sm text-slate-500 transition-colors hover:text-blue-600">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
