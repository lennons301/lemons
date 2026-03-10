import { createClient } from '@/lib/supabase/server'
import { InventoryList } from '@/components/features/inventory/inventory-list'
import type { InventoryItem } from '@/types/inventory'

export default async function InventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  // Cast needed: inventory_items not yet in generated Supabase types (regenerate after migration)
  const { data: items } = await (supabase as any)
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  return <InventoryList items={(items || []) as InventoryItem[]} householdId={householdId} />
}
