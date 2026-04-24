import { describe, it, expect } from 'vitest'
import { roundToPacket, type PacketChoice } from './pack-round'

const carrot1kg: PacketChoice = { pack_quantity: 1, pack_unit: 'kg', is_default: true, is_household: false }
const carrot500g: PacketChoice = { pack_quantity: 500, pack_unit: 'g', is_default: false, is_household: false }

describe('roundToPacket', () => {
  it('picks the smallest pack that covers required quantity (same unit)', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 600, unit: 'g' }, [carrot500g, carrot1kg])
    expect(result.packed_qty).toBe(1000)
    expect(result.pack_size).toEqual({ quantity: 1, unit: 'kg' })
    expect(result.waste_qty).toBeCloseTo(400)
  })

  it('returns exact fit with zero waste', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 1, unit: 'kg' }, [carrot500g, carrot1kg])
    expect(result.packed_qty).toBe(1)
    expect(result.waste_qty).toBe(0)
  })

  it('uses multiple packs of smallest size when no single pack fits', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 1200, unit: 'g' }, [carrot500g])
    expect(result.packed_qty).toBe(1500)
    expect(result.pack_size).toEqual({ quantity: 500, unit: 'g' })
    expect(result.pack_count).toBe(3)
  })

  it('prefers household-override rows over globals', () => {
    const globalOnion: PacketChoice = { pack_quantity: 3, pack_unit: 'ct', is_default: true, is_household: false }
    const householdOnion: PacketChoice = { pack_quantity: 5, pack_unit: 'ct', is_default: true, is_household: true }
    const result = roundToPacket({ name: 'onion', quantity: 2, unit: 'ct' }, [globalOnion, householdOnion])
    expect(result.pack_size).toEqual({ quantity: 5, unit: 'ct' })
  })

  it('passes through unchanged when no packet data matches', () => {
    const result = roundToPacket({ name: 'dragonfruit', quantity: 3, unit: 'ct' }, [])
    expect(result.required_qty).toBe(3)
    expect(result.packed_qty).toBe(3)
    expect(result.waste_qty).toBe(0)
    expect(result.pack_size).toBeNull()
    expect(result.pack_count).toBe(0)
  })

  it('passes through when quantity is null (unknown)', () => {
    const result = roundToPacket({ name: 'salt', quantity: null, unit: null }, [])
    expect(result.packed_qty).toBeNull()
    expect(result.pack_size).toBeNull()
  })
})
