import { createClient } from '@/lib/supabase/server'
import { InventoryList } from '@/components/features/inventory/inventory-list'

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

  const { data: items } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  return <InventoryList items={items || []} householdId={householdId} />
}
