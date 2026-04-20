import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const PacketSizeSchema = z.object({
  ingredient_name: z.string().min(1),
  pack_quantity: z.number().positive(),
  pack_unit: z.string().min(1),
  locale: z.literal('UK'),
  is_default: z.boolean(),
  notes: z.string().nullable().optional(),
})

const SeedSchema = z.array(PacketSizeSchema).min(20)

describe('packet_sizes_uk.json seed', () => {
  const raw = readFileSync(
    resolve(__dirname, '../../../supabase/seed_data/packet_sizes_uk.json'),
    'utf8',
  )
  const data: unknown = JSON.parse(raw)

  it('matches the PacketSizeSchema', () => {
    expect(() => SeedSchema.parse(data)).not.toThrow()
  })

  it('has exactly one default per ingredient_name', () => {
    const parsed = SeedSchema.parse(data)
    const defaultsByName = new Map<string, number>()
    for (const row of parsed) {
      if (row.is_default) {
        defaultsByName.set(row.ingredient_name, (defaultsByName.get(row.ingredient_name) ?? 0) + 1)
      }
    }
    for (const [name, count] of defaultsByName) {
      expect(count, `ingredient "${name}" has ${count} defaults`).toBe(1)
    }
  })

  it('uses normalized lowercase singular ingredient_names', () => {
    const parsed = SeedSchema.parse(data)
    for (const row of parsed) {
      expect(row.ingredient_name).toBe(row.ingredient_name.toLowerCase())
      expect(row.ingredient_name).not.toMatch(/\s{2,}/)
    }
  })
})
