import Anthropic from '@anthropic-ai/sdk'
import { validateExtractionResult, type ExtractionResult } from './extract-recipe'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_HTML_CHARS = 200_000

export function stripHtml(html: string): string {
  let text = html
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

const URL_EXTRACTION_PROMPT = `You are a recipe extraction assistant. The text below was scraped from a recipe web page. Extract structured data.

Return ONLY valid JSON in the same shape as the image-extraction pipeline uses:
{
  "title": "...",
  "description": "...",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "ingredients": [{ "raw_text": "...", "quantity": 2, "unit": "g", "name": "onion", "notes": null }],
  "instructions": ["..."],
  "tags": ["..."],
  "source_author": null,
  "source_book": null,
  "hero_image": null
}

Rules:
- Singular, lowercase, adjective-stripped names ("onion" not "red onions").
- quantity is numeric; null when unspecified. Use decimals for fractions.
- unit uses short abbreviations (g, kg, ml, l, tsp, tbsp, cup); null when none.
- instructions are one string per step, in order.
- tags: lowercase, one-word where possible.
- hero_image must be null (no image context available from URL scrape).`

export async function extractRecipeFromUrl(url: string, apiKey?: string): Promise<ExtractionResult> {
  const response = await fetch(url, { headers: { 'User-Agent': 'LemonsBot/1.0' } })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const html = await response.text()
  const text = stripHtml(html).slice(0, MAX_HTML_CHARS)

  const client = new Anthropic(apiKey ? { apiKey } : undefined)
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${URL_EXTRACTION_PROMPT}\n\n---\nSOURCE URL: ${url}\n\nPAGE TEXT:\n${text}` },
        ],
      },
    ],
  })

  const block = completion.content.find((c) => c.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  let jsonStr = block.text
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) jsonStr = match[1]
  const parsed = JSON.parse(jsonStr.trim())
  return validateExtractionResult(parsed)
}
