import { redirect } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createClient } from './server'

type Client = SupabaseClient<Database>

/**
 * Common page-level context: authenticated user + active household.
 * Redirects to /login or /onboarding if prerequisites are missing,
 * so callers can trust the returned values are non-null.
 */
export async function getPageContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id, display_name')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  return { supabase, user, householdId, profile: profile! }
}

/** Fetch household persons (unified members + managed members view). */
export async function getHouseholdPersons(supabase: Client, householdId: string) {
  const { data } = await supabase
    .from('household_persons')
    .select('id, display_name, date_of_birth, person_type')
    .eq('household_id', householdId)
  return data || []
}

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
