import { TodoListView } from '@/components/features/todos/todo-list-view'
import { getPageContext } from '@/lib/supabase/queries'
import { getListStats } from '@/lib/utils/list-stats'

export default async function TodosPage() {
  const { supabase, householdId } = await getPageContext()

  // Fetch non-archived, non-shopping lists with item counts
  const { data: lists } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status, priority, due_date)
    `)
    .eq('household_id', householdId)
    .neq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const today = new Date().toISOString().split('T')[0]

  const todoLists = (lists || []).map((list) => ({
    ...list,
    todo_items: undefined,
    ...getListStats(list.todo_items || [], today),
  }))

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', householdId)

  return <TodoListView lists={todoLists} householdId={householdId} persons={persons || []} />
}
