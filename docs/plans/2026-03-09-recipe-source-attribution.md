# Recipe Source Attribution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `source_author` and `source_book` fields to recipes with AI extraction, form editing, detail display, and list filtering.

**Architecture:** Two new nullable columns on `recipes` table. AI extraction prompt updated to detect author/book from images. Recipe form gets two new inputs. Recipe detail groups source info with clickable filter links. Recipe list page supports `author` and `book` query params.

**Tech Stack:** Supabase (PostgreSQL migration), Next.js (API routes, server components, client components), Anthropic Claude API, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00005_recipe_source_attribution.sql`

**Step 1: Write the migration**

```sql
-- Add source attribution fields to recipes
alter table public.recipes add column if not exists source_author text;
alter table public.recipes add column if not exists source_book text;
```

**Step 2: Apply locally**

Run: `npx supabase db reset`
Expected: Migration applies cleanly, local database has the new columns.

**Step 3: Commit**

```bash
git add supabase/migrations/00005_recipe_source_attribution.sql
git commit -m "feat: add source_author and source_book columns to recipes"
```

---

### Task 2: AI Extraction — Types and Validation

**Files:**
- Modify: `src/lib/ai/extract-recipe.ts` (ExtractionResult interface + validateExtractionResult)
- Modify: `src/lib/ai/extract-recipe.test.ts`

**Step 1: Write the failing test**

Add to the `validateExtractionResult` describe block in `src/lib/ai/extract-recipe.test.ts`:

```typescript
it('extracts source_author and source_book when present', () => {
  const input = {
    title: 'Coq au Vin',
    ingredients: [{ raw_text: '1 chicken' }],
    instructions: ['Cook it'],
    source_author: 'Julia Child',
    source_book: 'Mastering the Art of French Cooking',
  }
  const result = validateExtractionResult(input as any)
  expect(result.source_author).toBe('Julia Child')
  expect(result.source_book).toBe('Mastering the Art of French Cooking')
})

it('defaults source_author and source_book to null when missing', () => {
  const input = {
    title: 'Test Recipe',
    ingredients: [{ raw_text: 'some ingredient' }],
    instructions: ['Step 1'],
  }
  const result = validateExtractionResult(input as any)
  expect(result.source_author).toBeNull()
  expect(result.source_book).toBeNull()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/extract-recipe.test.ts`
Expected: FAIL — `source_author` property doesn't exist on ExtractionResult

**Step 3: Update ExtractionResult interface and validateExtractionResult**

In `src/lib/ai/extract-recipe.ts`:

Add to the `ExtractionResult` interface:
```typescript
source_author: string | null
source_book: string | null
```

Add to `validateExtractionResult` return object:
```typescript
source_author: typeof input.source_author === 'string' ? input.source_author : null,
source_book: typeof input.source_book === 'string' ? input.source_book : null,
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/extract-recipe.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/ai/extract-recipe.ts src/lib/ai/extract-recipe.test.ts
git commit -m "feat: add source_author and source_book to extraction types"
```

---

### Task 3: AI Extraction — Update Prompt

**Files:**
- Modify: `src/lib/ai/extract-recipe.ts` (EXTRACTION_PROMPT constant)

**Step 1: Update EXTRACTION_PROMPT**

Add `source_author` and `source_book` to the JSON schema in the prompt. Add these two fields to the example JSON:

```json
"source_author": "Author name if identifiable",
"source_book": "Book or publication title if identifiable"
```

Add this rule to the rules section:
```
- source_author: the chef, blogger, or author if identifiable from the images (cover page, headers, attribution text). null if not found.
- source_book: the book, website, or publication name if identifiable. null if not found.
```

**Step 2: Verify tests still pass**

Run: `npx vitest run src/lib/ai/extract-recipe.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add src/lib/ai/extract-recipe.ts
git commit -m "feat: update extraction prompt to detect source author and book"
```

---

### Task 4: API Routes — POST and PUT

**Files:**
- Modify: `src/app/api/recipes/route.ts` (POST handler — destructure + insert `source_author`, `source_book`)
- Modify: `src/app/api/recipes/[id]/route.ts` (PUT handler — destructure + update `source_author`, `source_book`)

**Step 1: Update POST in `src/app/api/recipes/route.ts`**

Add `source_author` and `source_book` to the destructured body (line 61):
```typescript
const { title, description, servings, prep_time, cook_time, instructions, source_url, source_author, source_book, household_id, ingredients, tags } = body
```

Add to the insert object (after `source_url`):
```typescript
source_author: source_author || null,
source_book: source_book || null,
```

**Step 2: Update PUT in `src/app/api/recipes/[id]/route.ts`**

Add `source_author` and `source_book` to the destructured body (line 50):
```typescript
const { title, description, servings, prep_time, cook_time, instructions, source_url, source_author, source_book, ingredients, tags } = body
```

Add to the update object (after `source_url`):
```typescript
source_author: source_author ?? null,
source_book: source_book ?? null,
```

**Step 3: Commit**

```bash
git add src/app/api/recipes/route.ts src/app/api/recipes/[id]/route.ts
git commit -m "feat: accept source_author and source_book in recipe API"
```

---

### Task 5: API Route — GET Filtering

**Files:**
- Modify: `src/app/api/recipes/route.ts` (GET handler)

**Step 1: Add author/book query param handling**

After the existing `tag` variable (line 19), add:
```typescript
const author = searchParams.get('author') || ''
const book = searchParams.get('book') || ''
```

After the existing tag filter block (around line 46), add:
```typescript
if (author) {
  recipes = recipes.filter((r: any) =>
    r.source_author?.toLowerCase() === author.toLowerCase()
  )
}
if (book) {
  recipes = recipes.filter((r: any) =>
    r.source_book?.toLowerCase() === book.toLowerCase()
  )
}
```

**Step 2: Commit**

```bash
git add src/app/api/recipes/route.ts
git commit -m "feat: support author and book query params in recipe list API"
```

---

### Task 6: Recipe Form — Add Fields

**Files:**
- Modify: `src/components/features/recipe-form.tsx`

**Step 1: Add state and initialData support**

Add to `RecipeFormProps.initialData` interface (after `source_url`):
```typescript
source_author: string | null
source_book: string | null
```

Add state variables (after `sourceUrl` state, around line 40):
```typescript
const [sourceAuthor, setSourceAuthor] = useState(initialData?.source_author || '')
const [sourceBook, setSourceBook] = useState(initialData?.source_book || '')
```

**Step 2: Add to form submission body**

In `handleSubmit`, add to the `body` object (after `source_url`):
```typescript
source_author: sourceAuthor.trim() || null,
source_book: sourceBook.trim() || null,
```

**Step 3: Pre-populate from extraction**

In `handleExtract`, after the existing `setTags` call (around line 176), add:
```typescript
if (result.source_author) setSourceAuthor(result.source_author)
if (result.source_book) setSourceBook(result.source_book)
```

**Step 4: Add form inputs**

In the Basic Info Card, after the Source URL input (after line 358), add:

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
  <div>
    <Label htmlFor="sourceAuthor">Author</Label>
    <Input
      id="sourceAuthor"
      value={sourceAuthor}
      onChange={(e) => setSourceAuthor(e.target.value)}
      placeholder="Julia Child"
    />
  </div>
  <div>
    <Label htmlFor="sourceBook">Book / Publication</Label>
    <Input
      id="sourceBook"
      value={sourceBook}
      onChange={(e) => setSourceBook(e.target.value)}
      placeholder="Mastering the Art of French Cooking"
    />
  </div>
</div>
```

**Step 5: Commit**

```bash
git add src/components/features/recipe-form.tsx
git commit -m "feat: add source author and book fields to recipe form"
```

---

### Task 7: Recipe Detail — Source Display

**Files:**
- Modify: `src/components/features/recipe-detail.tsx`

**Step 1: Update RecipeDetailProps interface**

Add to the recipe type (after `source_url`):
```typescript
source_author: string | null
source_book: string | null
```

**Step 2: Replace the existing source_url display**

Replace the block at lines 235-247 (the `recipe.source_url && (...)` paragraph) with a unified source section:

```tsx
{(recipe.source_book || recipe.source_author || recipe.source_url) && (
  <div className="text-muted-foreground text-sm">
    {(recipe.source_book || recipe.source_author) && (
      <p>
        {recipe.source_book && (
          <>
            From{' '}
            <Link
              href={`/recipes?book=${encodeURIComponent(recipe.source_book)}`}
              className="font-medium italic text-foreground hover:underline"
            >
              {recipe.source_book}
            </Link>
          </>
        )}
        {recipe.source_author && (
          <>
            {recipe.source_book ? ' by ' : 'By '}
            <Link
              href={`/recipes?author=${encodeURIComponent(recipe.source_author)}`}
              className="font-medium text-foreground hover:underline"
            >
              {recipe.source_author}
            </Link>
          </>
        )}
      </p>
    )}
    {recipe.source_url && (
      <p className={recipe.source_book || recipe.source_author ? 'mt-1' : ''}>
        Source:{' '}
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {recipe.source_url}
        </a>
      </p>
    )}
  </div>
)}
```

Note: `Link` from `next/link` is already imported in this file.

**Step 3: Commit**

```bash
git add src/components/features/recipe-detail.tsx
git commit -m "feat: display source attribution with clickable filter links"
```

---

### Task 8: Recipe List Page — Filter by Author/Book

**Files:**
- Modify: `src/app/(dashboard)/recipes/page.tsx`

**Step 1: Read author/book from searchParams**

Update the searchParams type (line 11):
```typescript
searchParams: Promise<{ search?: string; tag?: string; author?: string; book?: string }>
```

Update the destructuring (line 13):
```typescript
const { search, tag, author, book } = await searchParams
```

**Step 2: Add filtering after the existing tag filter**

After the tag filter block (around line 49), add:
```typescript
if (author) {
  filteredRecipes = filteredRecipes.filter((r: any) =>
    r.source_author?.toLowerCase() === author.toLowerCase()
  )
}
if (book) {
  filteredRecipes = filteredRecipes.filter((r: any) =>
    r.source_book?.toLowerCase() === book.toLowerCase()
  )
}
```

**Step 3: Show active author/book filter in UI**

Update the empty state message to account for author/book filters. Replace the condition on line 77:
```typescript
{search || tag ? 'No recipes match your search.' : 'No recipes yet.'}
```
with:
```typescript
{search || tag || author || book ? 'No recipes match your search.' : 'No recipes yet.'}
```

And similarly line 80:
```typescript
{!search && !tag && !author && !book && 'Add your first recipe to get started.'}
```

**Step 4: Commit**

```bash
git add src/app/(dashboard)/recipes/page.tsx
git commit -m "feat: filter recipe list by source author and book"
```

---

### Task 9: Verify End-to-End

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Build check**

Run: `npx next build`
Expected: Build succeeds with no type errors

**Step 3: Commit (if any fixes needed)**

Fix any issues found, commit with appropriate message.
