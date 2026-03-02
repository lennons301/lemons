import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHouseholdWithMember, getUserHouseholds } from '@/lib/supabase/queries'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const households = await getUserHouseholds(supabase, user.id)
    return NextResponse.json(households)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch households' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await request.json()

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Household name is required' }, { status: 400 })
  }

  try {
    const household = await createHouseholdWithMember(supabase, user.id, name.trim())
    return NextResponse.json(household, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
  }
}
