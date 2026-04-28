'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface Staple {
  id: string
  name: string
  default_quantity: number | null
  default_unit: string | null
}

interface StaplesManagerProps {
  householdId: string
  initialStaples: Staple[]
}

export function StaplesManager({ householdId, initialStaples }: StaplesManagerProps) {
  const [staples, setStaples] = useState(initialStaples)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [adding, setAdding] = useState(false)

  const addStaple = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/households/${householdId}/staples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          default_quantity: newQty ? parseFloat(newQty) : null,
          default_unit: newUnit.trim() || null,
        }),
      })
      if (res.ok) {
        const staple = await res.json()
        setStaples((prev) => [...prev, staple])
        setNewName('')
        setNewQty('')
        setNewUnit('')
      }
    } finally {
      setAdding(false)
    }
  }

  const deleteStaple = async (id: string) => {
    setStaples((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/households/${householdId}/staples/${id}`, { method: 'DELETE' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shopping Staples</CardTitle>
        <p className="text-sm text-muted-foreground">
          Items automatically included when generating shopping lists.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {staples.map((staple) => (
          <div key={staple.id} className="flex items-center gap-2 group">
            <span className="flex-1 text-sm">
              {staple.default_quantity && (
                <span className="font-medium">
                  {staple.default_quantity}{staple.default_unit ? ` ${staple.default_unit}` : ''}{' '}
                </span>
              )}
              {staple.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => deleteStaple(staple.id)}
            >
              <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t">
          <Input
            className="flex-1"
            placeholder="Item name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStaple()}
          />
          <Input
            className="w-16"
            placeholder="Qty"
            type="number"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
          />
          <Input
            className="w-20"
            placeholder="Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          />
          <Button size="icon" onClick={addStaple} disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
