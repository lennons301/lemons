import { PageHeaderSkeleton, MealPlanSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <MealPlanSkeleton />
    </div>
  )
}
