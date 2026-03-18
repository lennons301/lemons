import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/bench — Measures server-side latency to Supabase.
 * Deploy and hit this endpoint to see real Vercel→Supabase timing.
 * Remove after benchmarking.
 */
export async function GET() {
  const results: Record<string, number> = {}

  // 1. Create Supabase client
  let t = performance.now()
  const supabase = await createClient()
  results['createClient'] = performance.now() - t

  // 2. auth.getSession() — local JWT read
  t = performance.now()
  await supabase.auth.getSession()
  results['getSession'] = performance.now() - t

  // 3. auth.getUser() — network round-trip to GoTrue
  t = performance.now()
  await supabase.auth.getUser()
  results['getUser'] = performance.now() - t

  // 4. Simple DB query
  t = performance.now()
  await supabase.from('profiles').select('id').limit(1)
  results['query_profiles'] = performance.now() - t

  // 5. Another query (warm connection)
  t = performance.now()
  await supabase.from('households').select('id').limit(1)
  results['query_households'] = performance.now() - t

  // 6. Parallel 3 queries
  t = performance.now()
  await Promise.all([
    supabase.from('profiles').select('id').limit(1),
    supabase.from('households').select('id').limit(1),
    supabase.from('household_members').select('id').limit(1),
  ])
  results['parallel_3_queries'] = performance.now() - t

  // Round everything
  const rounded = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, `${v.toFixed(0)}ms`])
  )

  return NextResponse.json({
    region: process.env.VERCEL_REGION || 'local',
    results: rounded,
  })
}
