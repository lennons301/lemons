'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const SUGGESTED_TAGS = [
  // Cuisine
  'british', 'italian', 'mexican', 'indian', 'chinese', 'thai', 'japanese', 'mediterranean',
  // Dietary
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free',
  // Meal type
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
  // Planning
  'quick', 'weeknight', 'batch-cook', 'freezer-friendly', 'one-pot', 'special-occasion',
  // Other
  'kid-friendly', 'healthy', 'comfort-food',
]

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [input, setInput] = useState('')

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized || tags.includes(normalized)) return
    onChange([...tags, normalized])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const suggestions = SUGGESTED_TAGS.filter(
    (t) => !tags.includes(t) && t.includes(input.toLowerCase())
  ).slice(0, 8)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button type="button" onClick={() => removeTag(tag)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder="Add tags (press Enter or comma)..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {input.length === 0 && tags.length === 0 && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTED_TAGS.slice(0, 12).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              onClick={() => addTag(tag)}
            >
              + {tag}
            </Badge>
          ))}
        </div>
      )}
      {input.length > 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              onClick={() => addTag(tag)}
            >
              + {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
