import { APPOINTMENT_STATUS, PAYMENT_STATUS, statusStyle, titleCase, type StatusStyle } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function StatusBadge({
  status,
  kind = 'appointment',
  className,
}: {
  status: string | null | undefined;
  kind?: 'appointment' | 'payment';
  className?: string;
}) {
  const map = kind === 'payment' ? PAYMENT_STATUS : APPOINTMENT_STATUS;
  const style: StatusStyle = statusStyle(map, status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.className,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label ?? titleCase(status)}
    </span>
  );
}
