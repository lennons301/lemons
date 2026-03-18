export interface CalendarEvent {
  id: string
  household_id: string
  title: string
  description: string | null
  start_datetime: string
  end_datetime: string
  all_day: boolean
  location: string | null
  assigned_to: string[]
  created_by: string
  category: EventCategory
  metadata: unknown
  created_at: string
  updated_at: string
}

export interface ListProgress {
  list_id: string
  total: number
  completed: number
}

export interface CalendarEventWithProgress extends CalendarEvent {
  list_progress?: ListProgress | null
}

export type EventCategory = 'chore' | 'appointment' | 'birthday' | 'holiday' | 'social' | 'custom'

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'chore', label: 'Chore' },
  { value: 'social', label: 'Social' },
  { value: 'custom', label: 'Custom' },
]

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  appointment: '#4A90A4',
  birthday: '#C97BB6',
  holiday: '#F2CC8F',
  chore: '#81B29A',
  social: '#E8A87C',
  custom: '#3D405B',
}

export const VALID_CATEGORIES = new Set<string>(EVENT_CATEGORIES.map((c) => c.value))
