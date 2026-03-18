import { cache } from 'react'
import { redirect } from 'next/navigation'
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createClient } from './server'

type Client = SupabaseClient<Database>

/** Simple server-side timing — logs to stdout so it shows in `next dev` terminal. */
async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = performance.now()
  const result = await fn()
  const ms = (performance.now() - start).toFixed(0)
  console.log(`⏱ ${label}: ${ms}ms`)
  return result
}

/**
 * Cached per-request: creates Supabase client + validates auth.
 * React.cache ensures this runs once per server request even if
 * called from both layout.tsx and page.tsx.
 */
export const getCachedClient = cache(async () => {
  const supabase = await timed('createClient', () => createClient())
  const { data: { user } } = await timed('auth.getUser', () => supabase.auth.getUser())
  return { supabase, user }
})

/**
 * Cached per-request: fetches user profile.
 * Exported so layout.tsx can call it directly, sharing the cache with getPageContext.
 */
export const getCachedProfile = cache(async (supabase: Client, userId: string) => {
  const { data: profile } = await timed('query:profile', () =>
    supabase
      .from('profiles')
      .select('default_household_id, display_name')
      .eq('id', userId)
      .single()
  )
  return profile
})

/**
 * Common page-level context: authenticated user + active household.
 * Redirects to /login or /onboarding if prerequisites are missing,
 * so callers can trust the returned values are non-null.
 */
export async function getPageContext() {
  const { supabase, user } = await getCachedClient()
  if (!user) redirect('/login')

  const profile = await getCachedProfile(supabase, user.id)

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
