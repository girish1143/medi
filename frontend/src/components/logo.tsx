import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn('group inline-flex items-center gap-2.5', className)} aria-label="MediBook home">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-white shadow-sm transition-transform group-hover:scale-105">
        <HeartPulse className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="text-[19px] font-bold tracking-tight text-slate-900">
          Medi<span className="text-blue-600">Book</span>
        </span>
      )}
    </Link>
  );
}
