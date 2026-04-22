import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type HouseholdContext } from './prompt'

const context: HouseholdContext = {
  household: {
    members: [
      { name: 'Sean', role: 'adult' },
      { name: 'Kid1', role: 'managed', age: 7 },
    ],
    staples: ['olive oil', 'salt', 'pasta'],
    locale: 'UK',
  },
  catalogIndex: '[r:abc] Thai Green Curry | thai, curry',
}

describe('buildSystemPrompt', () => {
  it('includes the household block', () => {
    const prompt = buildSystemPrompt(context)
    expect(prompt).toContain('<household>')
    expect(prompt).toContain('Sean')
    expect(prompt).toContain('Kid1')
    expect(prompt).toContain('olive oil')
  })

  it('includes the catalog', () => {
    expect(buildSystemPrompt(context)).toContain('[r:abc] Thai Green Curry')
  })

  it('includes the planning guidelines', () => {
    const prompt = buildSystemPrompt(context)
    expect(prompt).toContain('Prefer recipes from the household catalog')
    expect(prompt).toContain('Avoid repeating the same recipe')
  })

  it('includes an empty catalog marker when catalog is empty', () => {
    const prompt = buildSystemPrompt({ ...context, catalogIndex: '' })
    expect(prompt).toContain('(no recipes yet)')
  })

  it('is stable across calls for the same input (cacheable)', () => {
    expect(buildSystemPrompt(context)).toBe(buildSystemPrompt(context))
  })
})
