import { NextResponse } from 'next/server'

/**
 * Returns a 404 NextResponse when the feature flag is off, else null.
 * Read env at call time (not import time) so per-test overrides work.
 */
export function notFoundIfDisabled(): NextResponse | null {
  if (process.env.MEAL_GEN_ENABLED === 'true') return null
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
