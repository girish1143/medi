import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  CreditCard,
  FolderHeart,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareWarning,
  Pill,
  Settings,
  ShieldCheck,
  Star,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react';
import type { UserRole } from '@/types';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const DASHBOARD_NAV: Record<UserRole, DashboardNavItem[]> = {
  patient: [
    { href: '/patient', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/patient/appointments', label: 'Appointments', icon: CalendarDays },
    { href: '/patient/prescriptions', label: 'Prescriptions', icon: Pill },
    { href: '/patient/records', label: 'Health records', icon: FolderHeart },
    { href: '/patient/profile', label: 'My profile', icon: UserRound },
    { href: '/patient/notifications', label: 'Notifications', icon: Bell },
    { href: '/patient/support', label: 'Help & support', icon: LifeBuoy },
  ],
  doctor: [
    { href: '/doctor', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/doctor/appointments', label: 'Appointments', icon: CalendarDays },
    { href: '/doctor/patients', label: 'My patients', icon: Users },
    { href: '/doctor/prescriptions', label: 'Prescriptions', icon: Pill },
    { href: '/doctor/schedule', label: 'Availability', icon: Clock },
    { href: '/doctor/profile', label: 'My profile', icon: Stethoscope },
    { href: '/doctor/notifications', label: 'Notifications', icon: Bell },
  ],
  admin: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
    { href: '/admin/doctors', label: 'Doctors', icon: ShieldCheck },
    { href: '/admin/patients', label: 'Patients', icon: UserRound },
    { href: '/admin/specialties', label: 'Specialties', icon: Stethoscope },
    { href: '/admin/clinics', label: 'Clinics', icon: Building2 },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/payments', label: 'Payments', icon: CreditCard },
    { href: '/admin/reviews', label: 'Reviews', icon: Star },
    { href: '/admin/complaints', label: 'Complaints', icon: MessageSquareWarning },
    { href: '/admin/audit', label: 'Audit log', icon: ClipboardList },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
    { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  ],
  receptionist: [
    { href: '/reception', label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: '/reception/appointments', label: 'Appointments', icon: CalendarDays },
    { href: '/reception/patients', label: 'Patients', icon: Users },
    { href: '/reception/book', label: 'Book appointment', icon: CalendarPlus },
    { href: '/reception/notifications', label: 'Notifications', icon: Bell },
  ],
};

export const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  patient: { label: 'Patient', className: 'bg-blue-50 text-blue-700 ring-blue-200' },
  doctor: { label: 'Doctor', className: 'bg-teal-50 text-teal-700 ring-teal-200' },
  admin: { label: 'Administrator', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
  receptionist: { label: 'Receptionist', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

export function isNavActive(pathname: string, item: DashboardNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
