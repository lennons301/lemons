import type { Json } from './database'

export interface TodoList {
  id: string
  household_id: string
  title: string
  list_type: 'general' | 'shopping' | 'checklist' | 'project'
  color: string | null
  pinned: boolean
  archived: boolean
  default_assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
  is_template?: boolean
  event_id?: string | null
}

export interface TodoListWithCounts extends TodoList {
  total_items: number
  completed_items: number
  overdue_count: number
  high_priority_count: number
  due_today_count: number
}

export interface TodoItem {
  id: string
  list_id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent'
  due_date: string | null
  assigned_to: string | null
  created_by: string
  sort_order: number
  group_name?: string | null
  metadata?: Json | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type TodoListType = TodoList['list_type']
export type TodoPriority = TodoItem['priority']

export const TODO_LIST_TYPES: { value: TodoListType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'project', label: 'Project' },
]

export const AMALFI_COLORS = [
  { name: 'Terracotta', hex: '#E07A5F' },
  { name: 'Mediterranean', hex: '#4A90A4' },
  { name: 'Lemon', hex: '#F2CC8F' },
  { name: 'Sage', hex: '#81B29A' },
  { name: 'Bougainvillea', hex: '#C97BB6' },
  { name: 'Twilight', hex: '#3D405B' },
  { name: 'Peach', hex: '#E8A87C' },
  { name: 'Olive', hex: '#5B8C5A' },
] as const

export const AMALFI_HEX_SET = new Set(AMALFI_COLORS.map((c) => c.hex))

export const PRIORITY_COLORS: Record<TodoPriority, string | null> = {
  urgent: '#ef4444',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
  none: null,
}

export const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export interface MyTaskItem extends TodoItem {
  list_title: string
  list_color: string | null
}
