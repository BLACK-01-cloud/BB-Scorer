// Page-area loader for any /admin/* route segment that's loading.
// Renders only the spinning circle; sits in the page slot below the chrome.
export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  );
}
