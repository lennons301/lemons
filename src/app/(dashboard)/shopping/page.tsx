import { createClient } from '@/lib/supabase/server'
import { ShoppingListView } from '@/components/features/shopping/shopping-list-view'

export default async function ShoppingPage() {
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
    completed_items: list.todo_items?.filter((i: any) => i.status === 'completed').length || 0,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shopping</h1>
      <ShoppingListView householdId={householdId} lists={shoppingLists} />
    </div>
  )
}
