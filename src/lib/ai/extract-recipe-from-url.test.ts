import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { extractRecipeFromUrl, stripHtml } from './extract-recipe-from-url'

describe('stripHtml', () => {
  it('removes scripts, styles, and preserves body text', () => {
    const html = '<html><head><style>x{}</style><script>var a=1</script></head><body><p>Hello <b>World</b></p></body></html>'
    const text = stripHtml(html)
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).not.toContain('x{}')
    expect(text).not.toContain('var a=1')
  })

  it('collapses runs of whitespace', () => {
    expect(stripHtml('<p>a     b\n\n\nc</p>')).toBe('a b c')
  })
})

describe('extractRecipeFromUrl', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body><h1>Lemon Salmon</h1><p>Ingredients: 2 salmon fillets</p></body></html>'),
      }),
    ) as unknown as typeof fetch
  })

  it('fetches the url, passes cleaned text to Claude, and returns parsed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Lemon Salmon', ingredients: [{ raw_text: '2 salmon fillets', name: 'salmon fillet', quantity: 2, unit: null, notes: null }], instructions: ['Bake it'], servings: 2 }) }],
    })
    const result = await extractRecipeFromUrl('https://example.com/recipe')
    expect(result.title).toBe('Lemon Salmon')
    expect(mockCreate).toHaveBeenCalledOnce()
    const call = mockCreate.mock.calls[0][0]
    expect(call.messages[0].content[0].text).toContain('Lemon Salmon')
  })

  it('throws on non-2xx fetch', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })) as unknown as typeof fetch
    await expect(extractRecipeFromUrl('https://example.com/missing')).rejects.toThrow(/404/)
  })
})
