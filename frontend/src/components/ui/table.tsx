import { AlertCircle, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export function TableContainer({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-left text-sm text-slate-700 dark:text-slate-300">
      {children}
    </table>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
      {children}
    </thead>
  );
}

export function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`border-b border-slate-100 px-4 py-3 align-middle dark:border-slate-800/80 ${className}`}>
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <TableContainer>
      <div className="divide-y divide-slate-100 p-4 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="flex gap-4 py-3">
            {Array.from({ length: cols }).map((__, cIdx) => (
              <div
                key={cIdx}
                className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-800"
              />
            ))}
          </div>
        ))}
      </div>
    </TableContainer>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Inbox className="h-5 w-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
      <span>
        Showing {start}–{end} of {total} records
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Button>
        <span className="px-2 font-medium">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
