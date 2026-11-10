export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
        <p className="text-sm font-medium">Loading…</p>
      </div>
    </div>
  );
}
