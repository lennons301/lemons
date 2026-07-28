'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RotationToggleProps {
  recipeId: string
  inRotation: boolean
  compact?: boolean
  className?: string
}

export function RotationToggle({ recipeId, inRotation, compact = false, className }: RotationToggleProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const label = inRotation ? 'Take out of rotation' : 'Return to rotation'
  const Icon = inRotation ? Archive : ArchiveRestore

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSaving(true)
    const res = await fetch(`/api/recipes/${recipeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ in_rotation: !inRotation }),
    })
    setSaving(false)
    if (res.ok) {
      router.refresh()
    } else {
      toast.error('Failed to update rotation')
    }
  }

  if (compact) {
    return (
      <Button
        variant="secondary"
        size="icon-sm"
        onClick={handleToggle}
        disabled={saving}
        aria-label={label}
        title={label}
        className={className}
      >
        {saving ? <Loader2 className="animate-spin" /> : <Icon />}
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={saving}
      className={className}
    >
      {saving ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Icon className="mr-1 h-4 w-4" />
      )}
      {label}
    </Button>
  )
}
