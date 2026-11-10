import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number | string | null | undefined): string {
  return currency.format(Number(amount ?? 0));
}

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  const date = safeDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDateInput(value: string | Date | null | undefined): string {
  const date = safeDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

export function formatWeekday(value: string | Date): string {
  const date = safeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(date);
}

export function formatMonth(value: string | Date): string {
  const date = safeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' }).format(date);
}

export function formatDayNumber(value: string | Date): string {
  const date = safeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(date);
}

export function formatDayLabel(value: string | Date): string {
  const date = safeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'MB';
  return name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  admin: 'Administrator',
  receptionist: 'Receptionist',
};

export const ROLE_HOME: Record<string, string> = {
  patient: '/patient',
  doctor: '/doctor',
  admin: '/admin',
  receptionist: '/reception',
};

export interface StatusStyle {
  label: string;
  className: string;
  dot: string;
}

export const APPOINTMENT_STATUS: Record<string, StatusStyle> = {
  pending: { label: 'Pending payment', className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', className: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  checked_in: { label: 'Checked in', className: 'bg-cyan-50 text-cyan-700 ring-cyan-200', dot: 'bg-cyan-500' },
  in_progress: { label: 'In progress', className: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  rejected: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  no_show: { label: 'No show', className: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
};

export const PAYMENT_STATUS: Record<string, StatusStyle> = {
  created: { label: 'Awaiting payment', className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  captured: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', className: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  refunded: { label: 'Refunded', className: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  partially_refunded: {
    label: 'Partially refunded',
    className: 'bg-orange-50 text-orange-700 ring-orange-200',
    dot: 'bg-orange-500',
  },
  pending: { label: 'Payment pending', className: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
};

export function statusStyle(map: Record<string, StatusStyle>, value: string | null | undefined): StatusStyle {
  if (!value) return { label: 'Unknown', className: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };
  return map[value] ?? { ...map.pending, label: titleCase(value) };
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function nextDaysIst(count = 10, from = new Date()): string[] {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(from);
    date.setDate(date.getDate() + index);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
  });
}

export function relativeTime(value: string | Date | null | undefined): string {
  const date = safeDate(value);
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

