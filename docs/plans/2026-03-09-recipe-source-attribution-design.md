# Recipe Source Attribution

## Summary

Add `source_author` and `source_book` fields to recipes, enabling attribution to chefs, cookbooks, websites, and publications. Fields are populated automatically during AI extraction (when detectable from images) and manually editable. Clickable links on recipe detail allow filtering the recipe list by author or book.

## Database

Add two nullable text columns to `recipes`:

- `source_author` — the person (chef, blogger, etc.)
- `source_book` — the book, website name, or publication

No new tables. These sit alongside the existing `source_url`.

## AI Extraction

Update the Claude prompt in `lib/ai/extract-recipe.ts` to return:

- `source_author: string | null`
- `source_book: string | null`

Instruction: "If you can identify the author or book/publication title from headers, footers, cover pages, or any visible text, include them." Works with multi-image flow — user can include a cover page photo alongside the recipe page.

## Recipe Form

Add two text inputs (Author, Book/Publication) in the Basic Info card near the existing Source URL field. Pre-populated from extraction if available, always manually editable.

## Recipe Detail Display

Group into a "Source" section below the description:

- "From *{source_book}*" (if present) — clickable, links to `/recipes?book={source_book}`
- "by {source_author}" (if present) — clickable, links to `/recipes?author={source_author}`
- Source URL as link below (existing behavior)

Natural rendering: "From *Mastering the Art of French Cooking* by Julia Child"

## Recipe List Filtering

Add `author` and `book` query params to the recipes list page (exact match, case-insensitive). Clickable links from recipe detail use these params.

## API Changes

- POST/PUT `/api/recipes` — accept and persist `source_author`, `source_book`
- GET `/api/recipes` — support `author` and `book` query params for filtering
- Extraction response type includes `source_author`, `source_book`
