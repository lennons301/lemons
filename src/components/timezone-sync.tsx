'use client'

import { useEffect } from 'react'

/**
 * Writes the browser's IANA timezone to a `tz` cookie so server components
 * can render dates in the user's local calendar.
 */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!tz) return
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    } catch {
      // ignore
    }
  }, [])
  return null
}
