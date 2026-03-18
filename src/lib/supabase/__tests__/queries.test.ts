import { describe, it, expect } from 'vitest'

// We test the exported helper types/shape, not the cache behavior
// (cache dedup is a React framework guarantee, not app logic)
describe('queries module', () => {
  it('exports getPageContext', async () => {
    const mod = await import('../queries')
    expect(mod.getPageContext).toBeDefined()
    expect(typeof mod.getPageContext).toBe('function')
  })

  it('exports getHouseholdPersons', async () => {
    const mod = await import('../queries')
    expect(mod.getHouseholdPersons).toBeDefined()
    expect(typeof mod.getHouseholdPersons).toBe('function')
  })

  it('exports getCachedClient', async () => {
    const mod = await import('../queries')
    expect(mod.getCachedClient).toBeDefined()
    expect(typeof mod.getCachedClient).toBe('function')
  })

  it('exports getCachedProfile', async () => {
    const mod = await import('../queries')
    expect(mod.getCachedProfile).toBeDefined()
    expect(typeof mod.getCachedProfile).toBe('function')
  })
})
