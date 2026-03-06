import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { maskApiKey } from '@/lib/utils/mask-key'

async function verifyAdmin(supabase: any, userId: string, householdId: string) {
  const { data: member } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('profile_id', userId)
    .single()
  return member?.role === 'admin'
}

// GET /api/households/[id]/api-key — get masked key status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await verifyAdmin(supabase, user.id, householdId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data: household } = await supabase
    .from('households')
    .select('anthropic_api_key')
    .eq('id', householdId)
    .single()

  const key = household?.anthropic_api_key || null
  return NextResponse.json({
    hasKey: !!key,
    masked: maskApiKey(key),
  })
}

// PUT /api/households/[id]/api-key — set or clear API key
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await verifyAdmin(supabase, user.id, householdId)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const apiKey = body.apiKey || null

  const { error } = await supabase
    .from('households')
    .update({ anthropic_api_key: apiKey })
    .eq('id', householdId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    hasKey: !!apiKey,
    masked: maskApiKey(apiKey),
  })
}
