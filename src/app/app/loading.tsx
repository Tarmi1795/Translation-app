// Route-level fallback for initial /app/* loads. Client-side navigations show
// the per-page Suspense skeletons inside each page instead.
import { Sk } from "@/components/skeletons";

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page">
      <Sk className="h-5 w-32" />
      <Sk className="mt-4 h-10 w-80 max-w-full" />
      <Sk className="mt-4 h-4 w-full max-w-md" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Sk key={index} className="min-h-36 rounded-2xl" />
        ))}
      </div>
      <Sk className="mt-6 min-h-72 rounded-2xl" />
    </div>
  );
}
