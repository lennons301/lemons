import { Skeleton } from '@/components/ui/skeleton'

/** Page header: title bar with optional action button placeholder */
export function PageHeaderSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-9 w-40" />
      {hasAction && <Skeleton className="h-10 w-32" />}
    </div>
  )
}

/** Grid of card skeletons (recipes, shopping lists, etc.) */
export function CardGridSkeleton({ count = 6, cols = 'grid-cols-2 lg:grid-cols-3' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** List of row skeletons (todos, inventory, etc.) */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 flex-1" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Dashboard home skeleton */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Calendar skeleton */
export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg border overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-8" />
        ))}
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  )
}

/** Meal plan weekly grid skeleton */
export function MealPlanSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-9" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="hidden md:grid grid-cols-[100px_repeat(7,1fr)] gap-px rounded-lg border overflow-hidden">
        {/* Header row */}
        <Skeleton className="h-12" />
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
        {/* 4 meal type rows x 8 cols */}
        {Array.from({ length: 32 }).map((_, i) => (
          <Skeleton key={`r-${i}`} className="h-20" />
        ))}
      </div>
    </div>
  )
}

/** Detail page skeleton (recipe detail, todo detail, etc.) */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  )
}
