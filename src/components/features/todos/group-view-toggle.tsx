'use client'

import { LayoutList, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GroupViewToggleProps {
  mode: 'sections' | 'tabs'
  onToggle: (mode: 'sections' | 'tabs') => void
}

export function GroupViewToggle({ mode, onToggle }: GroupViewToggleProps) {
  return (
    <div className="flex gap-0.5 border rounded-md p-0.5">
      <Button
        variant={mode === 'sections' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-2"
        onClick={() => onToggle('sections')}
        title="Sections view"
      >
        <LayoutList className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={mode === 'tabs' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-2"
        onClick={() => onToggle('tabs')}
        title="Tabs view"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
