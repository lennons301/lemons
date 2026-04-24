import { convertUnit, UNIT_TO_BASE, normalizeUnit } from './units'

export interface PacketChoice {
  pack_quantity: number
  pack_unit: string
  is_default: boolean
  is_household: boolean
}

export interface PackRoundInput {
  name: string
  quantity: number | null
  unit: string | null
}

export interface PackRoundResult {
  name: string
  required_qty: number | null
  required_unit: string | null
  packed_qty: number | null
  packed_unit: string | null
  waste_qty: number
  pack_size: { quantity: number; unit: string } | null
  pack_count: number
}

function compatibleInSameBucket(a: string | null, b: string): boolean {
  if (!a) return false
  if (a === b) return true
  const aInfo = UNIT_TO_BASE[a]
  const bInfo = UNIT_TO_BASE[b]
  if (!aInfo || !bInfo) return false
  return aInfo.group === bInfo.group
}

function toSameUnit(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity
  return convertUnit(quantity, from, to)
}

/**
 * Round an aggregated shopping line up to a whole-packet purchase.
 *
 * Selection rules:
 * 1. Filter packs to those with the same unit-group as the required unit.
 * 2. Prefer household-override packs over globals.
 * 3. If any single pack is ≥ required, pick the smallest such pack.
 * 4. Otherwise, use multiple copies of the smallest available pack.
 * 5. If no usable packs, pass through unchanged.
 */
export function roundToPacket(input: PackRoundInput, packs: PacketChoice[]): PackRoundResult {
  if (input.quantity == null) {
    return {
      name: input.name,
      required_qty: null,
      required_unit: input.unit,
      packed_qty: null,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  // Normalize input unit for consistent comparison
  const normalizedInputUnit = input.unit ? normalizeUnit(input.unit) : null

  const candidates = packs.filter((p) => {
    const normalizedPackUnit = normalizeUnit(p.pack_unit)
    return compatibleInSameBucket(normalizedInputUnit, normalizedPackUnit)
  })
  if (candidates.length === 0) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: input.quantity,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  // Split household vs global; prefer household.
  const household = candidates.filter((p) => p.is_household)
  const usable = household.length > 0 ? household : candidates

  // Normalize each candidate to the required unit so we can compare.
  const comparable = usable
    .map((p) => {
      const normalizedPackUnit = normalizeUnit(p.pack_unit)
      const qtyInRequired = normalizedInputUnit ? toSameUnit(p.pack_quantity, normalizedPackUnit, normalizedInputUnit) : null
      return { pack: p, qty: qtyInRequired }
    })
    .filter((c): c is { pack: PacketChoice; qty: number } => c.qty !== null && c.qty > 0)

  if (comparable.length === 0) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: input.quantity,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  // Sort ascending by qty-in-required-unit.
  comparable.sort((a, b) => a.qty - b.qty)

  // Try to find a single pack ≥ required (pick the smallest one that covers).
  const covering = comparable.filter((c) => c.qty >= input.quantity!)[0]

  if (covering) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: covering.qty,
      packed_unit: input.unit,
      waste_qty: Math.max(0, covering.qty - input.quantity),
      pack_size: { quantity: covering.pack.pack_quantity, unit: covering.pack.pack_unit },
      pack_count: 1,
    }
  }

  // No single pack covers. Use multiples of the smallest pack.
  const smallest = comparable[0]
  const count = Math.ceil(input.quantity / smallest.qty)
  const totalQty = smallest.qty * count
  return {
    name: input.name,
    required_qty: input.quantity,
    required_unit: input.unit,
    packed_qty: totalQty,
    packed_unit: input.unit,
    waste_qty: Math.max(0, totalQty - input.quantity),
    pack_size: { quantity: smallest.pack.pack_quantity, unit: smallest.pack.pack_unit },
    pack_count: count,
  }
}
