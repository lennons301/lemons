import { TodoDetail } from '@/components/features/todos/todo-detail'
import { notFound } from 'next/navigation'
import { getPageContext } from '@/lib/supabase/queries'

export default async function TodoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase, householdId } = await getPageContext()

  const [listResult, personsResult] = await Promise.all([
    supabase
      .from('todo_lists')
      .select(`*, todo_items(*)`)
      .eq('id', id)
      .neq('list_type', 'shopping')
      .order('sort_order', { referencedTable: 'todo_items', ascending: true })
      .single(),
    supabase
      .from('household_persons')
      .select('id, display_name')
      .eq('household_id', householdId),
  ])

  if (listResult.error || !listResult.data) notFound()

  return <TodoDetail list={listResult.data as any} persons={personsResult.data || []} />
}
