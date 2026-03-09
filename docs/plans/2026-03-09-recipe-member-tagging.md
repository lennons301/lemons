# Recipe Member Tagging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tag recipes with which household members will eat them, add DOB to managed members, create a unified person view, and surface suggested tags in the UI.

**Architecture:** New migration adds `date_of_birth` to `household_managed_members`, creates a `household_persons` view unifying both member tables, adds a `recipe_members` join table with RLS, and a Postgres `age_category()` function. Frontend adds a member multi-select to the recipe form, displays tagged members on recipe detail/cards, and adds a member filter to the recipe list. Existing freeform tags get expanded suggested defaults.

**Tech Stack:** Supabase (PostgreSQL, RLS), Next.js App Router, React, Tailwind CSS, shadcn/ui

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00006_recipe_members.sql`

**Step 1: Write the migration**

```sql
-- Add date_of_birth to managed members
ALTER TABLE household_managed_members
  ADD COLUMN date_of_birth date;

-- Age category helper (immutable for index usage)
CREATE OR REPLACE FUNCTION public.age_category(dob date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN dob IS NULL THEN NULL
    WHEN age(dob) < interval '1 year' THEN 'baby'
    WHEN age(dob) < interval '3 years' THEN 'toddler'
    WHEN age(dob) < interval '11 years' THEN 'child'
    ELSE 'teenager'
  END;
$$;

-- Unified person view across both member tables
CREATE OR REPLACE VIEW public.household_persons AS
  SELECT
    id,
    household_id,
    profile_id,
    display_name,
    NULL::date AS date_of_birth,
    'member'::text AS person_type
  FROM household_members
UNION ALL
  SELECT
    id,
    household_id,
    NULL::uuid AS profile_id,
    display_name,
    date_of_birth,
    'managed'::text AS person_type
  FROM household_managed_members;

-- Recipe-to-person join table
CREATE TABLE public.recipe_members (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (recipe_id, person_id)
);

CREATE INDEX idx_recipe_members_person ON recipe_members(person_id);

-- RLS
ALTER TABLE recipe_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipe_members for their household recipes"
  ON recipe_members FOR SELECT
  USING (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));

CREATE POLICY "Users can insert recipe_members for their household recipes"
  ON recipe_members FOR INSERT
  WITH CHECK (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));

CREATE POLICY "Users can delete recipe_members for their household recipes"
  ON recipe_members FOR DELETE
  USING (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));
```

**Step 2: Apply locally and verify**

Run: `supabase db reset`
Expected: Migration applies without errors. Check with `supabase db lint` for any warnings.

**Step 3: Verify the view works**

Run in Supabase SQL editor or via `psql`:
```sql
SELECT * FROM household_persons LIMIT 5;
SELECT age_category('2024-06-01'::date);  -- should return 'toddler'
SELECT age_category('2020-01-01'::date);  -- should return 'child'
```

**Step 4: Commit**

```bash
git add supabase/migrations/00006_recipe_members.sql
git commit -m "feat: add recipe_members table, household_persons view, age_category function"
```

---

### Task 2: Regenerate Supabase Types

**Files:**
- Modify: `src/types/database.ts` (auto-generated)

**Step 1: Regenerate types from local DB**

Run: `supabase gen types typescript --local > src/types/database.ts`

**Step 2: Verify the new types include recipe_members and household_persons**

Open `src/types/database.ts` and confirm:
- `Tables.recipe_members` exists with `recipe_id`, `person_id`, `created_at`
- `Views.household_persons` exists with `id`, `household_id`, `profile_id`, `display_name`, `date_of_birth`, `person_type`

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: regenerate Supabase types with recipe_members and household_persons"
```

---

### Task 3: Age Category TypeScript Utility

**Files:**
- Create: `src/lib/utils/age-category.ts`
- Create: `src/lib/utils/age-category.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/utils/age-category.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAgeCategory, type AgeCategory } from './age-category'

describe('getAgeCategory', () => {
  afterEach(() => { vi.useRealTimers() })

  it('returns baby for < 1 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2025-06-01')).toBe('baby')
  })

  it('returns toddler for 1-3 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2024-01-01')).toBe('toddler')
  })

  it('returns child for 3-11 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2020-01-01')).toBe('child')
  })

  it('returns teenager for 11+', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2014-01-01')).toBe('teenager')
  })

  it('returns null for null input', () => {
    expect(getAgeCategory(null)).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/utils/age-category.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/utils/age-category.ts
export type AgeCategory = 'baby' | 'toddler' | 'child' | 'teenager'

export function getAgeCategory(dob: string | null): AgeCategory | null {
  if (!dob) return null
  const birth = new Date(dob)
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    years--
  }
  if (years < 1) return 'baby'
  if (years < 3) return 'toddler'
  if (years < 11) return 'child'
  return 'teenager'
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/utils/age-category.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/lib/utils/age-category.ts src/lib/utils/age-category.test.ts
git commit -m "feat: add age category utility with tests"
```

---

### Task 4: Member Picker Component

**Files:**
- Create: `src/components/features/member-picker.tsx`

**Step 1: Create the component**

This is a multi-select that shows household persons with their color avatars. Checked persons are "suitable for" this recipe.

```typescript
// src/components/features/member-picker.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { getMemberColor, getMemberBgClass, getMemberTextClass } from '@/lib/utils/member-colors'
import { getAgeCategory } from '@/lib/utils/age-category'

export interface Person {
  id: string
  display_name: string | null
  date_of_birth: string | null
  person_type: 'member' | 'managed'
}

interface MemberPickerProps {
  persons: Person[]
  selected: string[]   // person IDs
  onChange: (selected: string[]) => void
}

export function MemberPicker({ persons, selected, onChange }: MemberPickerProps) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Select who this recipe is suitable for. Untagged recipes are treated as general / adults only.
      </p>
      <div className="space-y-1">
        {persons.map((person) => {
          const color = getMemberColor(person.id)
          const ageCategory = getAgeCategory(person.date_of_birth)
          return (
            <label
              key={person.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(person.id)}
                onCheckedChange={() => toggle(person.id)}
              />
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white ${getMemberBgClass(person.id)}`}
              >
                {(person.display_name || '?')[0].toUpperCase()}
              </span>
              <span className="text-sm font-medium">
                {person.display_name || 'Unknown'}
              </span>
              {ageCategory && (
                <Badge variant="outline" className="text-xs">
                  {ageCategory}
                </Badge>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/features/member-picker.tsx
git commit -m "feat: add member picker component for recipe member tagging"
```

---

### Task 5: Fetch Household Persons in Recipe Pages

**Files:**
- Modify: `src/app/(dashboard)/recipes/new/page.tsx`
- Modify: `src/app/(dashboard)/recipes/[id]/edit/page.tsx`
- Modify: `src/app/(dashboard)/recipes/[id]/page.tsx`

**Step 1: Update the new recipe page to fetch persons and pass to form**

In `src/app/(dashboard)/recipes/new/page.tsx`, after fetching the profile (line 14), add a query for household persons and pass to the form:

```typescript
// After the profile check (line 16), add:
const { data: persons } = await supabase
  .from('household_persons')
  .select('id, display_name, date_of_birth, person_type')
  .eq('household_id', profile.default_household_id)

// Update the return to pass persons:
return <RecipeForm householdId={profile.default_household_id} persons={persons || []} />
```

**Step 2: Update the edit recipe page similarly**

In `src/app/(dashboard)/recipes/[id]/edit/page.tsx`, after the profile check (line 21), add the same persons query. Also include `recipe_members(person_id)` in the recipe select (line 25):

```typescript
// Add persons query after profile check:
const { data: persons } = await supabase
  .from('household_persons')
  .select('id, display_name, date_of_birth, person_type')
  .eq('household_id', profile.default_household_id)

// Update recipe select to include recipe_members:
.select(`
  *,
  recipe_ingredients(*),
  recipe_tags(tag_name),
  recipe_members(person_id)
`)

// Pass persons to form:
return (
  <RecipeForm
    householdId={profile.default_household_id}
    initialData={recipe as any}
    persons={persons || []}
  />
)
```

**Step 3: Update the detail page to include recipe_members in fetch**

In `src/app/(dashboard)/recipes/[id]/page.tsx`, add `recipe_members(person_id)` to the select (line 17-21) and fetch persons:

```typescript
// Add persons query after user check:
const { data: profile } = await supabase
  .from('profiles')
  .select('default_household_id')
  .eq('id', user.id)
  .single()

const { data: persons } = await supabase
  .from('household_persons')
  .select('id, display_name, date_of_birth, person_type')
  .eq('household_id', profile?.default_household_id)

// Add recipe_members to recipe select:
.select(`
  *,
  recipe_ingredients(*),
  recipe_tags(tag_name),
  recipe_images(id, url, type, sort_order),
  recipe_members(person_id)
`)

// Pass persons to detail:
return <RecipeDetail recipe={recipe as any} persons={persons || []} />
```

**Step 4: Verify pages compile**

Run: `npx tsc --noEmit`
Expected: Type errors from RecipeForm and RecipeDetail not accepting `persons` yet — that's fine, we fix those in the next tasks.

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/recipes/new/page.tsx src/app/\(dashboard\)/recipes/\[id\]/edit/page.tsx src/app/\(dashboard\)/recipes/\[id\]/page.tsx
git commit -m "feat: fetch household persons in recipe pages"
```

---

### Task 6: Add Member Picker to Recipe Form

**Files:**
- Modify: `src/components/features/recipe-form.tsx`

**Step 1: Add persons prop and member state**

At the top of the file, import `MemberPicker` and `Person`:
```typescript
import { MemberPicker, type Person } from '@/components/features/member-picker'
```

Update `RecipeFormProps` to accept persons:
```typescript
interface RecipeFormProps {
  householdId: string
  persons?: Person[]
  initialData?: {
    // ... existing fields ...
    recipe_members?: { person_id: string }[]
  }
}
```

Update the component signature to accept `persons`:
```typescript
export function RecipeForm({ householdId, persons = [], initialData }: RecipeFormProps) {
```

Add state for selected members (near the other useState calls):
```typescript
const [selectedMembers, setSelectedMembers] = useState<string[]>(
  initialData?.recipe_members?.map((m) => m.person_id) || []
)
```

**Step 2: Include members in the API request body**

In the `handleSubmit` function, add `members: selectedMembers` to the body object:
```typescript
const body = {
  // ... existing fields ...
  members: selectedMembers,
}
```

**Step 3: Add the MemberPicker UI**

Add a new Card section after the Tags card (after the closing `</Card>` for tags, before `{/* Ingredients */}`):

```tsx
{/* Suitable For */}
{persons.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Suitable For</CardTitle>
    </CardHeader>
    <CardContent>
      <MemberPicker
        persons={persons}
        selected={selectedMembers}
        onChange={setSelectedMembers}
      />
    </CardContent>
  </Card>
)}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/components/features/recipe-form.tsx
git commit -m "feat: add member picker to recipe form"
```

---

### Task 7: Handle Members in Recipe API Routes

**Files:**
- Modify: `src/app/api/recipes/route.ts` (POST — create)
- Modify: `src/app/api/recipes/[id]/route.ts` (PUT — update, GET — read)

**Step 1: Update POST to insert recipe_members**

In `src/app/api/recipes/route.ts`, after the tags insert block (after line 139), add:

```typescript
// Insert recipe_members if provided
if (members && members.length > 0) {
  const memberRows = members.map((personId: string) => ({
    recipe_id: recipe.id,
    person_id: personId,
  }))

  const { error: memberError } = await supabase
    .from('recipe_members')
    .insert(memberRows)

  if (memberError) {
    console.error('Failed to insert recipe_members:', memberError.message)
  }
}
```

Also destructure `members` from the body (line 73):
```typescript
const { ..., members } = body
```

Update the final select to include `recipe_members`:
```typescript
.select(`
  *,
  recipe_ingredients(*),
  recipe_tags(tag_name),
  recipe_images(id, url, type, sort_order),
  recipe_members(person_id)
`)
```

**Step 2: Update PUT to replace recipe_members (delete-and-reinsert pattern)**

In `src/app/api/recipes/[id]/route.ts`, after the tags replacement block (after line 117), add:

```typescript
// Replace recipe_members: delete all, re-insert
if (members !== undefined) {
  await supabase.from('recipe_members').delete().eq('recipe_id', id)

  if (members.length > 0) {
    const memberRows = members.map((personId: string) => ({
      recipe_id: id,
      person_id: personId,
    }))

    const { error: memberError } = await supabase
      .from('recipe_members')
      .insert(memberRows)

    if (memberError) {
      console.error('Failed to replace recipe_members:', memberError.message)
    }
  }
}
```

Also destructure `members` from body (line 50) and add `recipe_members(person_id)` to both the PUT and GET return selects.

**Step 3: Update GET in `[id]/route.ts` to include recipe_members**

Add `recipe_members(person_id)` to the select in the GET handler (line 18-22):
```typescript
.select(`
  *,
  recipe_ingredients(*),
  recipe_tags(tag_name),
  recipe_images(id, url, type, sort_order),
  recipe_members(person_id)
`)
```

**Step 4: Update GET in `route.ts` (list) to include recipe_members**

Add `recipe_members(person_id)` to the select in the list handler (line 25-28).

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 6: Commit**

```bash
git add src/app/api/recipes/route.ts src/app/api/recipes/\[id\]/route.ts
git commit -m "feat: handle recipe_members in recipe API routes (CRUD)"
```

---

### Task 8: Display Members on Recipe Detail

**Files:**
- Modify: `src/components/features/recipe-detail.tsx`

**Step 1: Add persons prop and display tagged members**

Import the person type and color utilities:
```typescript
import { type Person } from '@/components/features/member-picker'
import { getMemberColor, getMemberBgClass } from '@/lib/utils/member-colors'
import { getAgeCategory } from '@/lib/utils/age-category'
import { Badge } from '@/components/ui/badge'
```

Add `persons` to the component props. The recipe data will now include `recipe_members`.

After the tags display section (after line 157, after the tags `</div>`), add:

```tsx
{recipe.recipe_members?.length > 0 && (
  <div className="mt-3 flex items-center gap-2">
    <span className="text-muted-foreground text-sm">Suitable for:</span>
    <div className="flex flex-wrap gap-1">
      {recipe.recipe_members.map((rm: any) => {
        const person = persons.find((p: any) => p.id === rm.person_id)
        if (!person) return null
        return (
          <span
            key={person.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${getMemberBgClass(person.id)}`}
          >
            {person.display_name || 'Unknown'}
          </span>
        )
      })}
    </div>
  </div>
)}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/components/features/recipe-detail.tsx
git commit -m "feat: display tagged members on recipe detail page"
```

---

### Task 9: Update Suggested Tags

**Files:**
- Modify: `src/components/features/tag-input.tsx`

**Step 1: Update the SUGGESTED_TAGS array**

Replace the existing `SUGGESTED_TAGS` (lines 8-17) with an expanded set that includes the design's recommended tags:

```typescript
const SUGGESTED_TAGS = [
  // Cuisine
  'british', 'italian', 'mexican', 'indian', 'chinese', 'thai', 'japanese', 'mediterranean',
  // Dietary
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free',
  // Meal type
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
  // Planning
  'quick', 'weeknight', 'batch-cook', 'freezer-friendly', 'one-pot', 'special-occasion',
  // Other
  'kid-friendly', 'healthy', 'comfort-food',
]
```

Changes from current: added `weeknight`, `freezer-friendly`, `one-pot`, `special-occasion`. These were in the design's recommended list and weren't already present.

**Step 2: Commit**

```bash
git add src/components/features/tag-input.tsx
git commit -m "feat: add weeknight, freezer-friendly, one-pot, special-occasion to suggested tags"
```

---

### Task 10: Member Filter on Recipe List

**Files:**
- Modify: `src/app/(dashboard)/recipes/page.tsx`
- Modify: `src/components/features/recipe-search.tsx` (if filter UI lives here)

**Step 1: Check recipe-search component**

Read `src/components/features/recipe-search.tsx` to understand the existing filter UI.

**Step 2: Add member filter param**

In `src/app/(dashboard)/recipes/page.tsx`, add `member` to searchParams type (line 11) and destructure it (line 13).

Fetch persons for the household:
```typescript
const { data: persons } = await supabase
  .from('household_persons')
  .select('id, display_name, date_of_birth, person_type')
  .eq('household_id', householdId)
```

Include `recipe_members(person_id)` in the recipe select.

Add JS filter for member after existing filters:
```typescript
if (member) {
  filteredRecipes = filteredRecipes.filter((r: any) =>
    r.recipe_members?.some((rm: any) => rm.person_id === member)
  )
}
```

Pass `persons` and `activeMember` to `RecipeSearch`.

**Step 3: Add member filter to RecipeSearch component**

Add a member dropdown/select alongside the existing tag filter. Show each person with their color avatar. Include an "Everyone" option that filters to recipes where all household persons are tagged.

**Step 4: Verify the full flow works**

Run: `npm run dev`
- Visit `/recipes` — verify member filter appears
- Create a recipe with members tagged — verify it saves
- Filter by member — verify correct recipes show

**Step 5: Commit**

```bash
git add src/app/\(dashboard\)/recipes/page.tsx src/components/features/recipe-search.tsx
git commit -m "feat: add member suitability filter to recipe list"
```

---

### Task 11: Final Verification & Cleanup

**Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Manual smoke test**

- Create a new recipe, tag 2 members → verify saved
- Edit the recipe, change members → verify updated
- View recipe detail → member avatars shown
- Filter recipe list by member → correct filtering
- Untagged recipe shows as "general / adults"

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: recipe member tagging cleanup"
```
