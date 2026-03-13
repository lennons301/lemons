import { ShoppingListView } from '@/components/features/shopping/shopping-list-view'
import { getPageContext } from '@/lib/supabase/queries'

export default async function ShoppingPage() {
  const { supabase, householdId } = await getPageContext()

  const { data: lists } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status)
    `)
    .eq('household_id', householdId)
    .eq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const shoppingLists = (lists || []).map((list) => ({
    ...list,
    total_items: list.todo_items?.length || 0,
    completed_items: list.todo_items?.filter((i) => i.status === 'completed').length || 0,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shopping</h1>
      <ShoppingListView householdId={householdId} lists={shoppingLists} />
    </div>
  )
}
