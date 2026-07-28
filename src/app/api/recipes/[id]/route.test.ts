/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'

let mockClient: any

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => mockClient,
}))

function makeClient({
  user = { id: 'u1' },
  updateResult = { data: null, error: null },
}: {
  user?: { id: string } | null
  updateResult?: { data: any; error: any }
} = {}) {
  const single = vi.fn().mockResolvedValue(updateResult)
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from,
    _spies: { from, update, eq, select, single },
  }
}

function makeRequest(body: unknown) {
  return { json: async () => body } as any
}

const params = Promise.resolve({ id: 'r1' })

describe('PATCH /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mockClient = makeClient({ user: null })
    const res = await PATCH(makeRequest({ in_rotation: false }), { params })
    expect(res.status).toBe(401)
  })

  it('returns 400 when in_rotation is not a boolean', async () => {
    mockClient = makeClient()
    for (const body of [{}, { in_rotation: 'yes' }, { in_rotation: 1 }, { in_rotation: null }]) {
      const res = await PATCH(makeRequest(body), { params })
      expect(res.status).toBe(400)
    }
    expect(mockClient._spies.update).not.toHaveBeenCalled()
  })

  it('persists taking a recipe out of rotation and returns the updated row', async () => {
    const row = { id: 'r1', title: 'Lemon Chicken', in_rotation: false }
    mockClient = makeClient({ updateResult: { data: row, error: null } })

    const res = await PATCH(makeRequest({ in_rotation: false }), { params })

    expect(mockClient._spies.from).toHaveBeenCalledWith('recipes')
    expect(mockClient._spies.update).toHaveBeenCalledWith({ in_rotation: false })
    expect(mockClient._spies.eq).toHaveBeenCalledWith('id', 'r1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(row)
  })

  it('persists returning a recipe to rotation', async () => {
    const row = { id: 'r1', title: 'Lemon Chicken', in_rotation: true }
    mockClient = makeClient({ updateResult: { data: row, error: null } })

    const res = await PATCH(makeRequest({ in_rotation: true }), { params })

    expect(mockClient._spies.update).toHaveBeenCalledWith({ in_rotation: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(row)
  })

  it('returns 404 when the recipe is not visible to the user', async () => {
    mockClient = makeClient({
      updateResult: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    })
    const res = await PATCH(makeRequest({ in_rotation: false }), { params })
    expect(res.status).toBe(404)
  })
})
