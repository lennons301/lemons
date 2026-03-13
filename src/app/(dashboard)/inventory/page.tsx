import { InventoryList } from '@/components/features/inventory/inventory-list'
import { getPageContext } from '@/lib/supabase/queries'

export default async function InventoryPage() {
  const { supabase, householdId } = await getPageContext()

  const { data: items } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  return <InventoryList items={items || []} householdId={householdId} />
}
