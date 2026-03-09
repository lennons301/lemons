# Recipe Member Tagging Design

## Goal

Tag recipes with which household members will eat them, enabling meal planning to filter by audience (e.g. whole family vs adults only). Also surface suggested recipe tags for common categories.

## Design Decisions

- **Untagged recipes = general / adults only.** Most recipes from books won't suit a toddler. Explicit tagging opts members in.
- **Unified person concept** via `household_persons` view — all features (recipes, todos, calendar, meal plans) reference a single person ID.
- **Date of birth on managed members** — derive age categories (`baby`, `toddler`, `child`, `teenager`) rather than storing a static enum. DOB is useful across the app (birthdays, age-appropriate portions).
- **Freeform tags stay freeform** — surface suggested tags via UI autocomplete, no schema change for tags.

## Schema Changes

### 1. Add `date_of_birth` to `household_managed_members`

```sql
ALTER TABLE household_managed_members
  ADD COLUMN date_of_birth date;
```

### 2. Create `household_persons` view

```sql
CREATE VIEW household_persons AS
  SELECT id, household_id, profile_id, display_name,
         NULL::date as date_of_birth, 'member' as person_type
  FROM household_members
UNION ALL
  SELECT id, household_id, NULL::uuid as profile_id, display_name,
         date_of_birth, 'managed' as person_type
  FROM household_managed_members;
```

### 3. Age category helper function

```sql
CREATE FUNCTION age_category(dob date)
RETURNS text AS $$
  SELECT CASE
    WHEN dob IS NULL THEN NULL
    WHEN age(dob) < interval '1 year' THEN 'baby'
    WHEN age(dob) < interval '3 years' THEN 'toddler'
    WHEN age(dob) < interval '11 years' THEN 'child'
    ELSE 'teenager'
  END
$$ LANGUAGE sql IMMUTABLE;
```

Age brackets: baby (<1), toddler (1-3), child (3-11), teenager (11+).

### 4. Create `recipe_members` table

```sql
CREATE TABLE recipe_members (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (recipe_id, person_id)
);

CREATE INDEX idx_recipe_members_person ON recipe_members(person_id);
```

RLS: same household-based pattern as other recipe tables — user can read/write recipe_members for recipes in their households.

### 5. TypeScript age category utility

```typescript
type AgeCategory = 'baby' | 'toddler' | 'child' | 'teenager'

function getAgeCategory(dob: string): AgeCategory {
  const years = differenceInYears(new Date(), new Date(dob))
  if (years < 1) return 'baby'
  if (years < 3) return 'toddler'
  if (years < 11) return 'child'
  return 'teenager'
}
```

## Behavior

- **No `recipe_members` rows** = untagged (UI shows "general / adults")
- **With rows** = explicitly suitable for those people
- Meal planning filters: "feeds everyone" = recipes where all household persons are tagged

## Suggested Tags (UI only)

Autocomplete suggestions on the existing freeform `recipe_tags` system:

- batch cooking, freezer friendly, vegetarian, vegan, quick, weeknight, special occasion, one pot, dairy free, gluten free

## UI Changes

- **Recipe form**: multi-select of household persons to tag as "suitable for"
- **Recipe detail**: show tagged members with color avatars
- **Recipe list**: filter by member suitability
