import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

export async function getUserHouseholds(supabase: Client, userId: string) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, display_name, households(id, name)')
    .eq('profile_id', userId)

  if (error) throw error
  return data
}

export async function createHouseholdWithMember(
  supabase: Client,
  userId: string,
  householdName: string
) {
  // Create household
  const { data: household, error: hError } = await supabase
    .from('households')
    .insert({ name: householdName, created_by: userId })
    .select()
    .single()

  if (hError) throw hError

  // Add creator as admin
  const { error: mError } = await supabase
    .from('household_members')
    .insert({
      household_id: household.id,
      profile_id: userId,
      role: 'admin',
    })

  if (mError) throw mError

  // Set as default household
  await supabase
    .from('profiles')
    .update({ default_household_id: household.id })
    .eq('id', userId)

  return household
}
