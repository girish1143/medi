import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface FormMessageProps {
  type: 'error' | 'success';
  message: string | null;
}

export function FormMessage({ type, message }: FormMessageProps) {
  if (!message) {
    return null;
  }

  const isError = type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span>{message}</span>
    </div>
  );
}
