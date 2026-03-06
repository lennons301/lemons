import { describe, it, expect } from 'vitest'
import { maskApiKey } from './mask-key'

describe('maskApiKey', () => {
  it('masks a standard Anthropic key', () => {
    expect(maskApiKey('sk-ant-api03-abcdefghijklmnop')).toBe('sk-ant-...mnop')
  })

  it('masks a short key', () => {
    expect(maskApiKey('sk-ant-1234')).toBe('sk-ant-...1234')
  })

  it('masks a very short key (less than 4 chars)', () => {
    expect(maskApiKey('abc')).toBe('...abc')
  })

  it('returns null for null/undefined/empty', () => {
    expect(maskApiKey(null)).toBeNull()
    expect(maskApiKey(undefined)).toBeNull()
    expect(maskApiKey('')).toBeNull()
  })
})
