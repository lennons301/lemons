import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteAcceptClient } from './invite-accept-client'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createClient()

  // Look up invite
  const { data: invite } = await supabase
    .from('household_invites')
    .select('*, households(name)')
    .eq('invite_code', code)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!invite) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold">Invalid or expired invite</h2>
        <p className="mt-2 text-muted-foreground">This invite link is no longer valid.</p>
      </div>
    )
  }

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect to signup with invite code preserved
    redirect(`/signup?invite=${code}`)
  }

  const householdName = (invite.households as unknown as { name: string })?.name ?? 'a household'

  return <InviteAcceptClient inviteCode={code} householdName={householdName} />
}
