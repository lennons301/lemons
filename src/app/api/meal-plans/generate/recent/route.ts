import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// GET /api/meal-plans/generate/recent?householdId=... — list active/abandoned conversations
export async function GET(request: NextRequest) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('meal_gen_conversations')
    .select('id, week_start, status, created_at, last_activity_at, created_by')
    .eq('household_id', householdId)
    .in('status', ['active', 'abandoned'])
    .order('last_activity_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
