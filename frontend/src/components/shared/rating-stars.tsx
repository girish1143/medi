import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RatingStars({
  rating,
  count,
  size = 'sm',
  className,
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const starSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Star className={cn(starSize, 'fill-amber-400 text-amber-400')} />
      <span className={cn('font-semibold text-slate-800', size === 'md' ? 'text-sm' : 'text-xs')}>
        {rating ? rating.toFixed(1) : 'New'}
      </span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-xs text-slate-500">({count})</span>
      )}
    </span>
  );
}
