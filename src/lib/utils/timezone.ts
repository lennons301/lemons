import 'server-only'
import { cookies } from 'next/headers'

const TZ_COOKIE = 'tz'

/**
 * Read the user's IANA timezone from the `tz` cookie set by <TimezoneSync />.
 * Falls back to UTC if the cookie is missing or invalid.
 */
export async function getUserTimezone(): Promise<string> {
  const store = await cookies()
  const raw = store.get(TZ_COOKIE)?.value
  if (!raw) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw })
    return raw
  } catch {
    return 'UTC'
  }
}

/** Return today's date as YYYY-MM-DD in the given IANA timezone. */
export function todayInTimezone(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}
