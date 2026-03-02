'use client'

import { useHousehold } from '@/components/providers/household-provider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function HouseholdSwitcher() {
  const { activeHousehold, households, setActiveHousehold } = useHousehold()

  if (households.length <= 1) {
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-medium">
        {activeHousehold?.name ?? 'No household'}
      </div>
    )
  }

  return (
    <Select
      value={activeHousehold?.id ?? ''}
      onValueChange={(id) => {
        const h = households.find((h) => h.id === id)
        if (h) setActiveHousehold(h)
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select household" />
      </SelectTrigger>
      <SelectContent>
        {households.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
