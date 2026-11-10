import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-950/50 dark:text-rose-300',
  info: 'bg-teal-50 text-teal-800 ring-1 ring-teal-600/20 dark:bg-teal-950/50 dark:text-teal-300',
  outline: 'border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'ACTIVE':
    case 'VERIFIED':
    case 'APPROVED':
    case 'SUCCEEDED':
    case 'PAID':
    case 'GRANTED':
    case 'ACCEPTED':
    case 'CONVERTED':
    case 'RESOLVED':
    case 'SUCCESS':
      return 'success';
    case 'PENDING':
    case 'PENDING_VERIFICATION':
    case 'UNDER_REVIEW':
    case 'TRIALING':
    case 'NEW':
    case 'QUALIFIED':
    case 'IN_PROGRESS':
    case 'WAITING_ON_USER':
    case 'QUEUED':
      return 'warning';
    case 'SUSPENDED':
    case 'REJECTED':
    case 'REVOKED':
    case 'FAILED':
    case 'DENIED':
    case 'CANCELLED':
    case 'DEACTIVATED':
      return 'danger';
    case 'ASSIGNED':
    case 'CONTACTED':
    case 'OPEN':
      return 'info';
    default:
      return 'default';
  }
}
