'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { getWeekStart, formatWeekLabel, shiftWeek } from '@/lib/utils/week'

interface CopyWeekDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentWeekStart: Date
  onCopy: (sourceWeekStart: string) => Promise<void>
}

export function CopyWeekDialog({ open, onOpenChange, currentWeekStart, onCopy }: CopyWeekDialogProps) {
  const [sourceOffset, setSourceOffset] = useState(-1) // Default: previous week
  const [copying, setCopying] = useState(false)

  const sourceWeek = shiftWeek(currentWeekStart, sourceOffset)

  const handleCopy = async () => {
    setCopying(true)
    try {
      await onCopy(sourceWeek.toISOString().split('T')[0])
      onOpenChange(false)
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy Week</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Copy from</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceOffset((o) => o - 1)}
            >
              &larr;
            </Button>
            <span className="flex-1 text-center text-sm">
              {formatWeekLabel(sourceWeek)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceOffset((o) => o + 1)}
              disabled={sourceOffset >= -1 && shiftWeek(currentWeekStart, sourceOffset + 1).getTime() === currentWeekStart.getTime()}
            >
              &rarr;
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This will copy all meals from the selected week into the current week ({formatWeekLabel(currentWeekStart)}).
            Existing meals in the current week will not be removed.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCopy} disabled={copying}>
            {copying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
