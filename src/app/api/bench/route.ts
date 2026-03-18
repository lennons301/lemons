import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, number> = {}
  let t = performance.now()
  const supabase = await createClient()
  results['createClient'] = performance.now() - t

  t = performance.now()
  await supabase.auth.getSession()
  results['getSession'] = performance.now() - t

  t = performance.now()
  await supabase.auth.getUser()
  results['getUser'] = performance.now() - t

  t = performance.now()
  await supabase.from('profiles').select('id').limit(1)
  results['query_1'] = performance.now() - t

  t = performance.now()
  await supabase.from('households').select('id').limit(1)
  results['query_2'] = performance.now() - t

  t = performance.now()
  await Promise.all([
    supabase.from('profiles').select('id').limit(1),
    supabase.from('households').select('id').limit(1),
    supabase.from('household_members').select('id').limit(1),
  ])
  results['parallel_3'] = performance.now() - t

  const rounded = Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, `${v.toFixed(0)}ms`])
  )
  return NextResponse.json({ region: process.env.VERCEL_REGION || 'local', results: rounded })
}
