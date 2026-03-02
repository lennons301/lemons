import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { inviteCode } = await request.json()

  // Find valid invite
  const { data: invite, error: findError } = await supabase
    .from('household_invites')
    .select('*')
    .eq('invite_code', inviteCode)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (findError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
  }

  // Check not already a member
  const { data: existing } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', invite.household_id)
    .eq('profile_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already a member' }, { status: 409 })
  }

  // Add member
  const { error: joinError } = await supabase
    .from('household_members')
    .insert({
      household_id: invite.household_id,
      profile_id: user.id,
      role: invite.role,
      invited_by: invite.created_by,
    })

  if (joinError) {
    return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })
  }

  // Mark invite accepted
  await supabase
    .from('household_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ ok: true })
}
