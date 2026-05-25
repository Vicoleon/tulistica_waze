import { Skeleton } from './ui/skeleton';

const groupSizes = [3, 5, 3];

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar skeleton */}
      <aside className="hidden md:flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* Brand area */}
        <div className="flex items-center gap-2 h-16 px-4 border-b border-sidebar-border/60">
          <Skeleton className="h-2 w-2 rounded-full bg-primary/40" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24 bg-foreground/10" />
            <Skeleton className="h-2 w-32 bg-foreground/5" />
          </div>
        </div>

        {/* Menu groups */}
        <div className="flex-1 px-2 py-4 space-y-6">
          {groupSizes.map((count, idx) => (
            <div key={idx} className="space-y-2">
              <Skeleton className="h-3 w-24 mx-3 bg-foreground/10" />
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Skeleton className="h-4 w-4 rounded-md bg-foreground/10" />
                  <Skeleton className="h-3 w-28 bg-foreground/10" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* User row */}
        <div className="border-t border-sidebar-border/60 p-3">
          <div className="flex items-center gap-3 px-1 py-1">
            <Skeleton className="h-9 w-9 rounded-full bg-accent/40" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20 bg-foreground/10" />
              <Skeleton className="h-2 w-32 bg-foreground/5" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar skeleton */}
        <div className="h-16 border-b border-border bg-background/85 flex items-center gap-3 px-4 sm:px-6">
          <Skeleton className="h-9 w-9 rounded-lg md:hidden bg-foreground/10" />
          <Skeleton className="hidden md:block h-10 w-full max-w-xl rounded-xl bg-foreground/5" />
          <div className="ml-auto" />
          <Skeleton className="h-9 w-9 rounded-full bg-foreground/10" />
        </div>

        {/* Content blocks (matches dashboard hero + tiles) */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-8 w-72 bg-foreground/10" />
            <Skeleton className="h-4 w-96 bg-foreground/5" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-3xl lg:col-span-2 bg-card" />
            <div className="space-y-4">
              <Skeleton className="h-32 rounded-2xl bg-card" />
              <Skeleton className="h-32 rounded-2xl bg-card" />
            </div>
          </div>

          <Skeleton className="h-14 rounded-2xl bg-card" />

          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32 rounded-2xl bg-card" />
            <Skeleton className="h-32 rounded-2xl bg-card" />
            <Skeleton className="h-32 rounded-2xl bg-card" />
          </div>
        </main>
      </div>
    </div>
  );
}
