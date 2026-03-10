export interface InventoryItem {
  id: string
  household_id: string
  created_by: string
  name: string
  display_name: string
  quantity: number | null
  unit: string | null
  location: 'fridge' | 'freezer' | 'pantry' | 'cupboard' | 'other'
  category: string | null
  expiry_date: string | null
  added_from: 'manual' | 'shopping_list'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InventoryDefault {
  id: string
  household_id: string
  normalized_name: string
  location: string
  category: string | null
}

export type InventoryLocation = InventoryItem['location']

export const INVENTORY_LOCATIONS: { value: InventoryLocation; label: string; icon: string }[] = [
  { value: 'fridge', label: 'Fridge', icon: '🧊' },
  { value: 'freezer', label: 'Freezer', icon: '❄️' },
  { value: 'pantry', label: 'Pantry', icon: '🗄️' },
  { value: 'cupboard', label: 'Cupboard', icon: '🚪' },
  { value: 'other', label: 'Other', icon: '📦' },
]

export const INVENTORY_CATEGORIES = [
  'produce', 'dairy', 'meat', 'fish', 'grain',
  'tinned', 'spice', 'condiment', 'other',
] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

export interface BulkInventoryItem {
  display_name: string
  name: string
  quantity: number | null
  unit: string | null
  location: InventoryLocation
  category: string | null
}
