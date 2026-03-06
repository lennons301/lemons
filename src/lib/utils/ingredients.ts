import { normalizeUnit, UNIT_ALIASES } from './units'

const SIZE_ADJECTIVES = ['large', 'small', 'medium', 'big', 'thin', 'thick', 'fresh', 'ripe', 'whole']

const KNOWN_UNITS = new Set([
  ...Object.keys(UNIT_ALIASES),
  ...Object.values(UNIT_ALIASES),
])

// Simple pluralization rules for food items
export function normalizeName(name: string): string {
  if (!name) return ''
  let result = name.trim().toLowerCase()

  // Strip size adjectives
  for (const adj of SIZE_ADJECTIVES) {
    result = result.replace(new RegExp(`\\b${adj}\\b`, 'g'), '')
  }
  result = result.replace(/\s+/g, ' ').trim()

  // Singularize
  result = singularize(result)

  return result
}

function singularize(word: string): string {
  // leaves → leaf
  if (word.endsWith('leaves')) return word.slice(0, -6) + 'leaf'
  // berries → berry
  if (word.endsWith('ries')) return word.slice(0, -3) + 'y'
  // tomatoes, potatoes → tomato, potato
  if (word.endsWith('toes')) return word.slice(0, -2)
  // matches, batches → match, batch (but not "es" words that are singular like "rice")
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('sses') || word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2)
  }
  // onions, carrots → onion, carrot
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1)
  }
  return word
}

// Parse fractions like "1/2" or "1 1/2"
function parseFraction(str: string): number | null {
  const mixed = str.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  }
  const frac = str.match(/^(\d+)\/(\d+)$/)
  if (frac) {
    return parseInt(frac[1]) / parseInt(frac[2])
  }
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

export interface ParsedIngredient {
  quantity: number | null
  unit: string | null
  name: string
  notes: string | null
  raw_text: string
}

export function parseIngredientText(text: string): ParsedIngredient {
  const raw_text = text.trim()
  let remaining = raw_text

  // Extract notes after comma
  let notes: string | null = null
  const commaIdx = remaining.indexOf(',')
  if (commaIdx !== -1) {
    notes = remaining.slice(commaIdx + 1).trim()
    remaining = remaining.slice(0, commaIdx).trim()
  }

  // Extract "to taste", "as needed" etc. as notes
  const notePatterns = /\b(to taste|as needed|for garnish|for serving)\b/i
  const noteMatch = remaining.match(notePatterns)
  if (noteMatch) {
    notes = notes ? `${noteMatch[1]}, ${notes}` : noteMatch[1]
    remaining = remaining.replace(notePatterns, '').trim()
  }

  // Try to extract quantity (number or fraction at start)
  let quantity: number | null = null
  const qtyMatch = remaining.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)/)
  if (qtyMatch) {
    quantity = parseFraction(qtyMatch[1])
    remaining = remaining.slice(qtyMatch[0].length).trim()
  }

  // Check if next word (possibly joined with number like "400ml") is a unit
  // Handle joined format like "400ml"
  if (quantity === null) {
    const joinedMatch = raw_text.match(/^(\d+\.?\d*)\s*(ml|g|kg|l|oz|lb|lbs|tsp|tbsp)\b/i)
    if (joinedMatch) {
      quantity = parseFloat(joinedMatch[1])
      remaining = raw_text.slice(joinedMatch[0].length).trim()
      const unit = normalizeUnit(joinedMatch[2])
      const name = normalizeName(remaining)
      return { quantity, unit: unit || null, name, notes, raw_text }
    }
  }

  // Try to extract unit
  let unit: string | null = null
  const words = remaining.split(/\s+/)
  if (words.length > 0 && KNOWN_UNITS.has(words[0].toLowerCase())) {
    unit = normalizeUnit(words[0])
    remaining = words.slice(1).join(' ')
  }

  const name = normalizeName(remaining)

  return { quantity, unit: unit || null, name, notes, raw_text }
}
