import { TodoDetail } from '@/components/features/todos/todo-detail'
import { notFound } from 'next/navigation'
import { getPageContext } from '@/lib/supabase/queries'

export default async function TodoDetailPage({
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
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error || !list) notFound()

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', list.household_id)

  return <TodoDetail list={list as any} persons={persons || []} />
}
