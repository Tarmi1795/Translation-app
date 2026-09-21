// Navigation skeleton: with this boundary present, client-side route changes
// paint instantly while the server streams the real page.
export default function AppLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-64 rounded-lg bg-[var(--subtle)]" />
      <div className="mt-4 h-4 w-96 max-w-full rounded bg-[var(--subtle)]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-36 rounded-2xl border bg-[var(--surface)]" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-2xl border bg-[var(--surface)]" />
    </div>
  );
}
