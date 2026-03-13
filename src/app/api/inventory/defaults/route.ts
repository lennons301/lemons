import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const names = url.searchParams.get('names') // comma-separated normalized names

  if (!householdId || !names) {
    return NextResponse.json({ error: 'householdId and names are required' }, { status: 400 })
  }

  const nameList = names.split(',').map((n) => n.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from('inventory_defaults')
    .select('*')
    .eq('household_id', householdId)
    .in('normalized_name', nameList)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
