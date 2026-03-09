/**
 * Deterministic member color assignment for avatars, calendar events,
 * todo assignments, meal plan entries, etc.
 *
 * Colors are defined as CSS variables in globals.css (--member-*).
 * Each member gets a stable color based on their ID.
 */

const MEMBER_COLORS = [
  'azure',
  'coral',
  'lemon',
  'sage',
  'bougainvillea',
  'lavender',
  'tangerine',
  'teal',
] as const

export type MemberColor = (typeof MEMBER_COLORS)[number]

/** Hash a UUID-like string to a stable index. */
function hashId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Get the color name for a member by their ID. */
export function getMemberColor(memberId: string): MemberColor {
  return MEMBER_COLORS[hashId(memberId) % MEMBER_COLORS.length]
}

/** Tailwind CSS variable class for a member's background color. */
export function getMemberBgClass(memberId: string): string {
  return `bg-member-${getMemberColor(memberId)}`
}

/** Tailwind CSS variable class for a member's text color. */
export function getMemberTextClass(memberId: string): string {
  return `text-member-${getMemberColor(memberId)}`
}

/**
 * Get a CSS variable reference for inline styles (e.g. for chart colors).
 * Returns something like "var(--member-azure)".
 */
export function getMemberCssVar(memberId: string): string {
  return `var(--member-${getMemberColor(memberId)})`
}

/**
 * Get all member colors for a list of member IDs.
 * Returns a Map of memberId -> color name.
 */
export function getMemberColorMap(memberIds: string[]): Map<string, MemberColor> {
  const map = new Map<string, MemberColor>()
  for (const id of memberIds) {
    map.set(id, getMemberColor(id))
  }
  return map
}
