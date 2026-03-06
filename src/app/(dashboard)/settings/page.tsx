import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MemberList } from '@/components/features/member-list'
import { InviteLinkGenerator } from '@/components/features/invite-link-generator'
import { ManagedMemberForm } from '@/components/features/managed-member-form'
import { ApiKeySettings } from '@/components/features/api-key-settings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  // Fetch household details
  const { data: household } = await supabase
    .from('households')
    .select('*')
    .eq('id', householdId)
    .single()

  // Fetch members
  const { data: members } = await supabase
    .from('household_members')
    .select('*, profiles!household_members_profile_id_fkey(display_name, email)')
    .eq('household_id', householdId)

  // Fetch managed members
  const { data: managedMembers } = await supabase
    .from('household_managed_members')
    .select('*')
    .eq('household_id', householdId)

  // Check if current user is admin
  const currentMember = members?.find((m) => m.profile_id === user.id)
  const isAdmin = currentMember?.role === 'admin'

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{household?.name ?? 'Settings'}</h1>
        <p className="mt-1 text-muted-foreground">Manage your household members and settings.</p>
      </div>

      <MemberList members={members ?? []} isAdmin={isAdmin} />

      <ManagedMemberForm
        householdId={householdId}
        managedMembers={managedMembers ?? []}
        isAdmin={isAdmin}
      />

      {isAdmin && <InviteLinkGenerator householdId={householdId} />}

      {isAdmin && <ApiKeySettings householdId={householdId} />}
    </div>
  )
}
