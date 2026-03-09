export type AgeCategory = 'baby' | 'toddler' | 'child' | 'teenager'

export function getAgeCategory(dob: string | null): AgeCategory | null {
  if (!dob) return null
  const birth = new Date(dob)
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    years--
  }
  if (years < 1) return 'baby'
  if (years < 3) return 'toddler'
  if (years < 11) return 'child'
  return 'teenager'
}
