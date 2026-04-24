import type { ToolContext, ToolResult } from '../types'

export interface CheckPacketSizesInput {
  ingredient_names: string[]
}

export interface PacketSizesOutput {
  name: string
  packs: Array<{ quantity: number; unit: string; is_default: boolean }>
}

export async function checkPacketSizes(
  ctx: ToolContext,
  input: CheckPacketSizesInput,
): Promise<ToolResult<PacketSizesOutput[]>> {
  const names = input.ingredient_names.map((n) => n.trim().toLowerCase()).filter(Boolean)
  if (names.length === 0) {
    return { content: [] }
  }

  const { data, error } = await ctx.supabase
    .from('packet_sizes')
    .select('ingredient_name, pack_quantity, pack_unit, is_default, household_id')
    .in('ingredient_name', names)
    .order('is_default', { ascending: false })

  if (error) {
    return { content: [], is_error: true }
  }

  const byName = new Map<string, PacketSizesOutput>()
  for (const name of names) {
    byName.set(name, { name, packs: [] })
  }

  // Group raw rows by ingredient_name.
  const raw = new Map<string, typeof data>()
  for (const row of data ?? []) {
    if (!raw.has(row.ingredient_name)) raw.set(row.ingredient_name, [])
    raw.get(row.ingredient_name)!.push(row)
  }

  for (const [name, rows] of raw) {
    const target = byName.get(name)
    if (!target) continue
    const hasHouseholdRows = rows.some((r) => r.household_id !== null)
    const visible = hasHouseholdRows ? rows.filter((r) => r.household_id !== null) : rows
    for (const row of visible) {
      target.packs.push({
        quantity: Number(row.pack_quantity),
        unit: row.pack_unit,
        is_default: row.is_default,
      })
    }
  }

  return { content: [...byName.values()] }
}
