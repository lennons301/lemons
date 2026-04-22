'use client'

import { useEffect, useState } from 'react'
import { History, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface RecentConversation {
  id: string
  week_start: string
  status: 'active' | 'abandoned'
  last_activity_at: string
}

interface Props {
  householdId: string
  onResume: (conversationId: string) => void | Promise<void>
}

export function RecentPlansDropdown({ householdId, onResume }: Props) {
  const [items, setItems] = useState<RecentConversation[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/meal-plans/generate/recent?householdId=${householdId}`)
      if (res.ok && !cancelled) {
        setItems(await res.json())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, householdId])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4 mr-1" />
          Recent
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Resume a plan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <DropdownMenuItem disabled>(no in-progress plans)</DropdownMenuItem>
        ) : (
          items.map((it) => (
            <DropdownMenuItem key={it.id} onClick={() => onResume(it.id)}>
              <div className="flex flex-col">
                <span className="text-sm">Week of {it.week_start}</span>
                <span className="text-xs text-muted-foreground">
                  {it.status === 'active' ? 'in progress' : 'abandoned'} · {new Date(it.last_activity_at).toLocaleString()}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
