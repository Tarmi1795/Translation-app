// Layout-matched loading skeletons. Each mirrors the final page structure so
// navigation paints the page's shape immediately while data streams in.
import { cn } from "@/lib/utils";

export function Sk({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[var(--subtle)]", className)} />;
}

function SkCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("rounded-2xl border bg-[var(--surface)] p-5 sm:p-6", className)}>{children}</div>;
}

export function DashboardSkeleton() {
  return (
    <div>
      <div className="relative overflow-hidden rounded-[1.75rem] border bg-[var(--surface)] p-6 sm:p-8">
        <Sk className="h-6 w-40" />
        <Sk className="mt-6 h-10 w-full max-w-xl" />
        <Sk className="mt-4 h-4 w-full max-w-md" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <SkCard key={index} className="min-h-40">
            <Sk className="h-4 w-24" />
            <Sk className="mt-4 h-8 w-20" />
            <Sk className="mt-6 h-3 w-32" />
          </SkCard>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <SkCard className="min-h-80" />
        <SkCard className="min-h-80" />
      </div>
    </div>
  );
}

export function TranslateSkeleton() {
  return (
    <div>
      <Sk className="h-5 w-32" />
      <Sk className="mt-4 h-10 w-80 max-w-full" />
      <Sk className="mt-4 h-4 w-full max-w-lg" />
      <div className="mt-7 grid max-w-3xl grid-cols-3 gap-0 rounded-xl border bg-[var(--surface)]">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex min-h-12 items-center gap-2 border-e px-4 last:border-e-0">
            <Sk className="size-6 rounded-full" />
            <Sk className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <SkCard className="p-5 sm:p-7">
          <Sk className="h-4 w-32" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Sk className="min-h-16 rounded-xl" />
            <Sk className="min-h-16 rounded-xl" />
          </div>
          <Sk className="mt-7 h-4 w-24" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Sk key={index} className="min-h-20 rounded-xl" />
            ))}
          </div>
          <Sk className="mt-7 h-4 w-28" />
          <Sk className="mt-3 min-h-12 w-full rounded-xl" />
          <Sk className="mt-6 min-h-56 w-full rounded-2xl border-2 border-dashed" />
          <Sk className="mt-7 min-h-12 w-56 rounded-xl" />
        </SkCard>
        <aside className="space-y-4">
          <SkCard><Sk className="h-4 w-28" /><Sk className="mt-3 h-8 w-24" /></SkCard>
          <SkCard><Sk className="h-4 w-32" /><Sk className="mt-3 h-8 w-24" /><Sk className="mt-4 h-3 w-40" /></SkCard>
          <SkCard className="min-h-56" />
        </aside>
      </div>
    </div>
  );
}

export function GlossarySkeleton() {
  return (
    <div>
      <Sk className="h-5 w-32" />
      <Sk className="mt-4 h-10 w-96 max-w-full" />
      <Sk className="mt-4 h-4 w-full max-w-md" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <SkCard>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Sk className="min-h-11 rounded-xl" />
            <Sk className="min-h-11 rounded-xl" />
            <Sk className="min-h-11 w-24 rounded-xl" />
          </div>
          <Sk className="mt-4 min-h-11 w-full rounded-xl" />
          <div className="mt-6 divide-y">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="grid gap-3 px-1 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <Sk className="h-4 w-36" />
                <Sk className="h-4 w-28" />
                <Sk className="size-9 rounded-xl" />
              </div>
            ))}
          </div>
        </SkCard>
        <div className="space-y-4">
          <SkCard><Sk className="h-4 w-40" /><Sk className="mt-3 h-8 w-16" /></SkCard>
          <SkCard className="min-h-40" />
        </div>
      </div>
    </div>
  );
}

export function TeamSkeleton() {
  return (
    <div>
      <Sk className="h-5 w-32" />
      <Sk className="mt-4 h-10 w-72 max-w-full" />
      <Sk className="mt-4 h-4 w-full max-w-md" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_380px]">
        <SkCard>
          <Sk className="h-5 w-40" />
          <div className="mt-6 divide-y">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex min-h-18 items-center gap-3 px-1 py-3">
                <Sk className="size-10 rounded-xl" />
                <div className="flex-1">
                  <Sk className="h-4 w-36" />
                  <Sk className="mt-2 h-3 w-48" />
                </div>
                <Sk className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </SkCard>
        <SkCard>
          <Sk className="size-11 rounded-xl" />
          <Sk className="mt-5 h-5 w-36" />
          <Sk className="mt-4 min-h-11 w-full rounded-xl" />
          <Sk className="mt-4 min-h-11 w-full rounded-xl" />
          <Sk className="mt-5 min-h-11 w-full rounded-xl" />
        </SkCard>
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div>
      <Sk className="h-5 w-24" />
      <Sk className="mt-4 h-10 w-64 max-w-full" />
      <Sk className="mt-4 h-4 w-full max-w-lg" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SkCard className="min-h-56" />
        <SkCard className="min-h-56" />
        <SkCard className="min-h-72 lg:col-span-2" />
      </div>
    </div>
  );
}

export function ProjectSkeleton() {
  return (
    <div>
      <Sk className="h-4 w-28" />
      <Sk className="mt-3 h-9 w-80 max-w-full" />
      <Sk className="mt-3 h-4 w-56" />
      <SkCard className="mt-6">
        <div className="flex items-center gap-3">
          <Sk className="size-11 rounded-xl" />
          <div className="flex-1">
            <Sk className="h-4 w-32" />
            <Sk className="mt-2 h-3 w-48" />
          </div>
          <Sk className="h-7 w-16 rounded-lg" />
        </div>
        <Sk className="mt-4 h-2 w-full rounded-full" />
      </SkCard>
      <div className="mt-6 flex gap-2">
        <Sk className="min-h-11 w-40 rounded-xl" />
        <Sk className="min-h-11 w-36 rounded-xl" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SkCard className="min-h-96" />
        <SkCard className="min-h-96" />
      </div>
    </div>
  );
}
