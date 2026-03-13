import { MemberList } from '@/components/features/members/member-list'
import { InviteLinkGenerator } from '@/components/features/settings/invite-link-generator'
import { ManagedMemberForm } from '@/components/features/members/managed-member-form'
import { ApiKeySettings } from '@/components/features/settings/api-key-settings'
import { StaplesManager } from '@/components/features/settings/staples-manager'
import { getPageContext } from '@/lib/supabase/queries'

export default async function SettingsPage() {
  const { supabase, user, householdId } = await getPageContext()

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

  // Fetch staples
  const { data: staples } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true })

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

      <StaplesManager householdId={householdId} initialStaples={staples || []} />
    </div>
  )
}
