import { createClient } from '@/lib/supabase/server'
import { TodoListView } from '@/components/features/todos/todo-list-view'

export default async function TodosPage() {
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

  // Fetch non-archived, non-shopping lists with item counts
  const { data: lists } = await (supabase as any)
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

  const todoLists = (lists || []).map((list: any) => {
    const items = list.todo_items || []
    return {
      ...list,
      todo_items: undefined,
      total_items: items.length,
      completed_items: items.filter((i: any) => i.status === 'completed').length,
      overdue_count: items.filter((i: any) => i.due_date && i.due_date < today && i.status !== 'completed').length,
      high_priority_count: items.filter((i: any) => (i.priority === 'high' || i.priority === 'urgent') && i.status !== 'completed').length,
      due_today_count: items.filter((i: any) => i.due_date === today && i.status !== 'completed').length,
    }
  })

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', householdId)

  return <TodoListView lists={todoLists} householdId={householdId} persons={persons || []} />
}
