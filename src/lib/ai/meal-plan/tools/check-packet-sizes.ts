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
    .select('ingredient_name, pack_quantity, pack_unit, is_default')
    .in('ingredient_name', names)
    .order('is_default', { ascending: false })

  if (error) {
    return { content: [], is_error: true }
  }

  const byName = new Map<string, PacketSizesOutput>()
  for (const name of names) {
    byName.set(name, { name, packs: [] })
  }
  for (const row of data ?? []) {
    const entry = byName.get(row.ingredient_name)
    if (!entry) continue
    entry.packs.push({
      quantity: Number(row.pack_quantity),
      unit: row.pack_unit,
      is_default: row.is_default,
    })
  }

  return { content: [...byName.values()] }
}
