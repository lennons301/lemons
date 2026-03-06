'use client'

import { useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseIngredientText } from '@/lib/utils/ingredients'
import { normalizeUnit } from '@/lib/utils/units'

export interface IngredientRow {
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  group: string | null
  optional: boolean
  notes: string | null
}

interface IngredientInputProps {
  ingredients: IngredientRow[]
  onChange: (ingredients: IngredientRow[]) => void
}

export function IngredientInput({ ingredients, onChange }: IngredientInputProps) {
  const [quickAdd, setQuickAdd] = useState('')

  const handleQuickAdd = () => {
    if (!quickAdd.trim()) return
    const parsed = parseIngredientText(quickAdd)
    const newIngredient: IngredientRow = {
      raw_text: quickAdd.trim(),
      quantity: parsed.quantity,
      unit: parsed.unit ? normalizeUnit(parsed.unit) : null,
      name: parsed.name,
      group: null,
      optional: false,
      notes: parsed.notes,
    }
    onChange([...ingredients, newIngredient])
    setQuickAdd('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleQuickAdd()
    }
  }

  const removeIngredient = (idx: number) => {
    onChange(ingredients.filter((_, i) => i !== idx))
  }

  const updateIngredient = (idx: number, field: keyof IngredientRow, value: any) => {
    const updated = [...ingredients]
    updated[idx] = { ...updated[idx], [field]: value }
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {ingredients.map((ing, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <GripVertical className="text-muted-foreground mt-2.5 h-4 w-4 shrink-0" />
          <div className="grid flex-1 grid-cols-12 gap-2">
            <Input
              className="col-span-2"
              placeholder="Qty"
              value={ing.quantity ?? ''}
              onChange={(e) =>
                updateIngredient(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)
              }
              type="number"
              step="any"
            />
            <Input
              className="col-span-2"
              placeholder="Unit"
              value={ing.unit ?? ''}
              onChange={(e) => updateIngredient(idx, 'unit', e.target.value || null)}
            />
            <Input
              className="col-span-4"
              placeholder="Ingredient"
              value={ing.name ?? ''}
              onChange={(e) => updateIngredient(idx, 'name', e.target.value || null)}
            />
            <Input
              className="col-span-3"
              placeholder="Notes"
              value={ing.notes ?? ''}
              onChange={(e) => updateIngredient(idx, 'notes', e.target.value || null)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="col-span-1 h-9 w-9"
              onClick={() => removeIngredient(idx)}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          placeholder='Quick add: "2 large onions, diced"'
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="outline" onClick={handleQuickAdd} disabled={!quickAdd.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  )
}
