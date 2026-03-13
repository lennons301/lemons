import { ShoppingListDetail } from '@/components/features/shopping/shopping-list-detail'
import { notFound } from 'next/navigation'
import { getPageContext } from '@/lib/supabase/queries'

export default async function ShoppingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await getPageContext()

  const { data: list, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .eq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error || !list) notFound()

  return <ShoppingListDetail list={list as any} householdId={list.household_id} />
}
