import { PageHeaderSkeleton, CardGridSkeleton } from '@/components/ui/page-skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasAction />
      <CardGridSkeleton count={4} cols="grid-cols-1 md:grid-cols-2" />
    </div>
  )
}
