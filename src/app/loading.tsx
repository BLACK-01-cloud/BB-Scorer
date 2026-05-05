// Shown automatically by Next.js between page navigations and on refresh.
// Only the spinning circle — no card, no background tint.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  );
}
