import { Badge } from '@/components/ui/badge'

interface OutOfRotationBadgeProps {
  inRotation: boolean | null | undefined
  className?: string
}

// Renders only when a recipe is explicitly out of rotation.
// Missing values mean the default: in rotation.
export function OutOfRotationBadge({ inRotation, className }: OutOfRotationBadgeProps) {
  if (inRotation !== false) return null
  return (
    <Badge variant="outline" className={className}>
      Out of rotation
    </Badge>
  )
}
