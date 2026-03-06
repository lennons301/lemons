# UX Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the app from stock shadcn to a warm, mobile-friendly recipe app with multi-image AI extraction and recipe image display.

**Architecture:** CSS variable theme swap, responsive sidebar via Sheet component, multi-image Claude API messages, Supabase Storage for source images.

**Tech Stack:** Tailwind CSS variables, shadcn/ui Sheet, Anthropic Claude vision API (multi-image), Supabase Storage, Next.js Image component.

---

### Task 1: Warm Lemon Theme — CSS Variables

**Files:**
- Modify: `src/app/globals.css:50-83` (light theme variables)
- Modify: `src/app/globals.css:85-117` (dark theme variables)
- Modify: `src/app/layout.tsx:15-18` (metadata title/description)

**Step 1: Update light theme CSS variables**

Replace the `:root` block in `globals.css` with warm lemon palette:

```css
:root {
  --radius: 0.625rem;
  --background: oklch(0.985 0.008 85);
  --foreground: oklch(0.18 0.02 60);
  --card: oklch(0.993 0.004 85);
  --card-foreground: oklch(0.18 0.02 60);
  --popover: oklch(0.993 0.004 85);
  --popover-foreground: oklch(0.18 0.02 60);
  --primary: oklch(0.75 0.16 85);
  --primary-foreground: oklch(0.18 0.02 60);
  --secondary: oklch(0.955 0.02 85);
  --secondary-foreground: oklch(0.25 0.02 60);
  --muted: oklch(0.955 0.015 85);
  --muted-foreground: oklch(0.48 0.02 60);
  --accent: oklch(0.92 0.04 85);
  --accent-foreground: oklch(0.25 0.02 60);
  --destructive: oklch(0.55 0.2 25);
  --border: oklch(0.9 0.02 85);
  --input: oklch(0.9 0.02 85);
  --ring: oklch(0.75 0.16 85);
  --chart-1: oklch(0.75 0.16 85);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.25 0.025 60);
  --sidebar-foreground: oklch(0.92 0.02 85);
  --sidebar-primary: oklch(0.75 0.16 85);
  --sidebar-primary-foreground: oklch(0.18 0.02 60);
  --sidebar-accent: oklch(0.32 0.025 60);
  --sidebar-accent-foreground: oklch(0.92 0.02 85);
  --sidebar-border: oklch(0.35 0.02 60);
  --sidebar-ring: oklch(0.75 0.16 85);
}
```

Key changes:
- Background: warm cream instead of pure white
- Primary: golden lemon yellow
- Text: warm near-black with slight warm hue
- Muted: warm gray (not blue-gray)
- Destructive: terracotta red
- Sidebar: dark warm charcoal

**Step 2: Update dark theme variables**

```css
.dark {
  --background: oklch(0.16 0.02 60);
  --foreground: oklch(0.92 0.02 85);
  --card: oklch(0.22 0.02 60);
  --card-foreground: oklch(0.92 0.02 85);
  --popover: oklch(0.22 0.02 60);
  --popover-foreground: oklch(0.92 0.02 85);
  --primary: oklch(0.75 0.16 85);
  --primary-foreground: oklch(0.18 0.02 60);
  --secondary: oklch(0.28 0.02 60);
  --secondary-foreground: oklch(0.92 0.02 85);
  --muted: oklch(0.28 0.02 60);
  --muted-foreground: oklch(0.62 0.02 60);
  --accent: oklch(0.28 0.02 60);
  --accent-foreground: oklch(0.92 0.02 85);
  --destructive: oklch(0.65 0.2 22);
  --border: oklch(0.92 0.02 85 / 10%);
  --input: oklch(0.92 0.02 85 / 15%);
  --ring: oklch(0.75 0.16 85);
  --chart-1: oklch(0.75 0.16 85);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.18 0.02 60);
  --sidebar-foreground: oklch(0.92 0.02 85);
  --sidebar-primary: oklch(0.75 0.16 85);
  --sidebar-primary-foreground: oklch(0.18 0.02 60);
  --sidebar-accent: oklch(0.28 0.02 60);
  --sidebar-accent-foreground: oklch(0.92 0.02 85);
  --sidebar-border: oklch(0.92 0.02 85 / 10%);
  --sidebar-ring: oklch(0.75 0.16 85);
}
```

**Step 3: Update metadata**

In `src/app/layout.tsx`, change:
```typescript
export const metadata: Metadata = {
  title: "Lemons",
  description: "Household management for families",
};
```

**Step 4: Run `npm run build` to verify no errors**

**Step 5: Commit**

```
feat: add warm lemon theme and update metadata
```

---

### Task 2: Replace Hardcoded Gray Classes in Sidebar

**Files:**
- Modify: `src/components/features/sidebar.tsx`

The sidebar currently uses hardcoded `bg-white`, `bg-gray-100`, `text-gray-600`, etc. Replace with CSS variable-based classes so the theme applies.

**Step 1: Update sidebar classes**

```typescript
// Line 30: aside element
<aside className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">

// Line 31: header
<div className="flex h-14 items-center border-b border-sidebar-border px-4">

// Line 32: brand link
<Link href="/" className="text-xl font-bold text-sidebar-foreground">

// Line 48-53: nav link classes
isActive
  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'

// Line 62: footer
<div className="border-t border-sidebar-border p-3">
```

**Step 2: Run `npm run build` to verify**

**Step 3: Commit**

```
feat: apply theme variables to sidebar
```

---

### Task 3: Mobile Responsive Layout — Hamburger Drawer

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/features/mobile-header.tsx`
- Modify: `src/components/features/sidebar.tsx`

**Step 1: Create MobileHeader component**

Create `src/components/features/mobile-header.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { SidebarNav } from '@/components/features/sidebar'

export function MobileHeader() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-sidebar px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-lg font-bold text-sidebar-foreground">Lemons</span>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
```

**Step 2: Extract SidebarNav from Sidebar**

Refactor `src/components/features/sidebar.tsx` to export a `SidebarNav` component that contains the nav items, household switcher, and user menu. The `Sidebar` component wraps it for desktop. Both `Sidebar` and `MobileHeader` use `SidebarNav`.

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChefHat,
  Package,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HouseholdSwitcher } from './household-switcher'
import { UserMenu } from './user-menu'

const navItems = [
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: ChefHat },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/todos', label: 'Todos', icon: CheckSquare },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/shopping', label: 'Shopping', icon: ShoppingCart },
]

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="text-xl font-bold text-sidebar-foreground" onClick={onNavigate}>
          Lemons
        </Link>
      </div>

      <div className="px-3 py-3">
        <HouseholdSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <UserMenu />
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <SidebarNav />
    </aside>
  )
}
```

**Step 3: Update dashboard layout**

Modify `src/app/(dashboard)/layout.tsx`:

```typescript
import { MobileHeader } from '@/components/features/mobile-header'
// ... existing imports

// In the return, replace the flex layout:
return (
  <HouseholdProvider ...>
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <MobileHeader />
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  </HouseholdProvider>
)
```

**Step 4: Run `npm run build` and test on mobile viewport**

**Step 5: Commit**

```
feat: add mobile hamburger drawer navigation
```

---

### Task 4: Mobile Responsive Content — Recipe Pages

**Files:**
- Modify: `src/app/(dashboard)/recipes/page.tsx:63,86` (padding, grid)
- Modify: `src/components/features/recipe-form.tsx:235` (3-col grid)
- Modify: `src/components/features/recipe-detail.tsx:75` (padding)

**Step 1: Fix recipe list page padding and grid**

In `src/app/(dashboard)/recipes/page.tsx`:
- Line 63: `<div className="space-y-6 p-6">` → `<div className="space-y-6">`
  (padding now handled by layout's `<main>`)
- Line 86: grid already has `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — good

**Step 2: Fix recipe form 3-col grid**

In `src/components/features/recipe-form.tsx`:
- Line 163: `<form ... className="mx-auto max-w-3xl space-y-6 p-6">` → remove `p-6`
- Line 235: `<div className="grid grid-cols-3 gap-4">` → `<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">`

**Step 3: Fix recipe detail padding**

In `src/components/features/recipe-detail.tsx`:
- Line 75: `<div className="mx-auto max-w-3xl space-y-6 p-6">` → remove `p-6`

**Step 4: Run `npm run build` and verify**

**Step 5: Commit**

```
feat: make recipe pages mobile responsive
```

---

### Task 5: Multi-Image Extraction — Backend

**Files:**
- Modify: `src/lib/ai/extract-recipe.ts:86-132`
- Modify: `src/app/api/recipes/extract/route.ts`
- Modify: `src/lib/ai/extract-recipe.test.ts`

**Step 1: Update the test**

In `src/lib/ai/extract-recipe.test.ts`, update the mock expectations to handle array of images:

- Change `extractRecipeFromImage(base64, mediaType, apiKey)` calls to `extractRecipeFromImages([{ base64, mediaType }], apiKey)`
- Add a test for multiple images
- Add a test for hint parameter

**Step 2: Run tests — verify they fail**

Run: `npx vitest run src/lib/ai/extract-recipe.test.ts`

**Step 3: Update `extract-recipe.ts`**

Change the function signature:

```typescript
export interface ImageInput {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

export async function extractRecipeFromImages(
  images: ImageInput[],
  apiKey?: string,
  hint?: string
): Promise<ExtractionResult> {
  const client = new Anthropic(apiKey ? { apiKey } : undefined)

  const imageBlocks = images.map((img) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mediaType,
      data: img.base64,
    },
  }))

  const promptText = hint
    ? `User note: ${hint}\n\n${EXTRACTION_PROMPT}`
    : EXTRACTION_PROMPT

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: promptText },
        ],
      },
    ],
  })

  // ... rest unchanged (JSON parsing + validation)
}
```

Also update the prompt to mention multi-image:

Add to `EXTRACTION_PROMPT`:
```
- If multiple images are provided, they are all part of the same recipe (e.g. different pages, front/back of card). Combine information from all images into a single recipe.
```

**Step 4: Run tests — verify they pass**

**Step 5: Update API route**

In `src/app/api/recipes/extract/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  // ... auth check unchanged

  const formData = await request.formData()
  const files = formData.getAll('images') as File[]
  const hint = formData.get('hint') as string | null
  const householdId = formData.get('householdId') as string | null

  if (!files.length) {
    return NextResponse.json({ error: 'No images provided' }, { status: 400 })
  }

  if (files.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 images allowed' }, { status: 400 })
  }

  // Validate all file types
  for (const file of files) {
    if (!VALID_TYPES.includes(file.type as any)) {
      return NextResponse.json(
        { error: `Invalid image type: ${file.type}. Supported: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
  }

  // ... household API key lookup unchanged

  // Convert all to base64
  const images = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
      mediaType: file.type as ImageInput['mediaType'],
    }))
  )

  try {
    const result = await extractRecipeFromImages(images, apiKey, hint || undefined)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Recipe extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to extract recipe from image. Please try again or enter manually.' },
      { status: 422 }
    )
  }
}
```

**Step 6: Update smoke test to use new signature**

In `src/lib/ai/extract-recipe.smoke.test.ts`:
- Change `extractRecipeFromImage(base64, 'image/png', apiKey)` to `extractRecipeFromImages([{ base64, mediaType: 'image/png' }], apiKey)`

**Step 7: Run all tests**

Run: `npx vitest run src/lib/ai/`

**Step 8: Commit**

```
feat: support multi-image extraction with text hints
```

---

### Task 6: Multi-Image Extraction — Frontend

**Files:**
- Modify: `src/components/features/recipe-form.tsx:100-147,176-202`

**Step 1: Replace single file input with multi-image UI**

Replace the extraction section in `recipe-form.tsx`:

- Add state: `const [selectedFiles, setSelectedFiles] = useState<File[]>([])`
- Add state: `const [hint, setHint] = useState('')`
- Multi-file input: `<input type="file" multiple accept="image/*" />`
- Show thumbnails of selected files with remove buttons (use `URL.createObjectURL`)
- Optional hint text input below thumbnails
- "Extract Recipe" button that sends all files + hint to API
- Clean up object URLs on unmount

Update `handleImageExtract` to:
- Use `selectedFiles` state instead of event target
- Build FormData with `images` (multiple appends) instead of `image`
- Include `hint` field if non-empty
- Clear `selectedFiles` after successful extraction

**Step 2: Run `npm run build` and test manually**

**Step 3: Commit**

```
feat: add multi-image extraction UI with thumbnails and hint
```

---

### Task 7: Recipe Card — Image Thumbnails

**Files:**
- Modify: `src/components/features/recipe-card.tsx`

**Step 1: Add hero image to recipe card**

Update `RecipeCard` to show the first image (prefer type `hero` or `photo`, fall back to any) as a thumbnail:

```typescript
import Image from 'next/image'
import { UtensilsCrossed } from 'lucide-react'

// Inside RecipeCard:
const heroImage = recipe.recipe_images?.find(
  (img) => img.type === 'hero' || img.type === 'photo'
) || recipe.recipe_images?.[0]

// Before CardHeader, inside Card:
{heroImage ? (
  <div className="relative aspect-video overflow-hidden rounded-t-lg">
    <Image
      src={heroImage.url}
      alt={recipe.title}
      fill
      className="object-cover"
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    />
  </div>
) : (
  <div className="flex aspect-video items-center justify-center rounded-t-lg bg-muted">
    <UtensilsCrossed className="h-8 w-8 text-muted-foreground/40" />
  </div>
)}
```

**Step 2: Run `npm run build` and verify**

**Step 3: Commit**

```
feat: add image thumbnails to recipe cards
```

---

### Task 8: Recipe Detail — Hero Image + Source Images

**Files:**
- Modify: `src/components/features/recipe-detail.tsx`
- Install: `npx shadcn@latest add collapsible`

**Step 1: Install collapsible component**

Run: `npx shadcn@latest add collapsible`

**Step 2: Add hero image to recipe detail**

After the back/edit/delete buttons and before the title, add:

```typescript
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// Find hero image
const heroImage = recipe.recipe_images?.find(
  (img) => img.type === 'hero' || img.type === 'photo'
) || recipe.recipe_images?.find((img) => img.type !== 'source')

const sourceImages = recipe.recipe_images?.filter((img) => img.type === 'source') || []

// After buttons div, before title:
{heroImage && (
  <div className="relative aspect-video overflow-hidden rounded-lg">
    <Image
      src={heroImage.url}
      alt={recipe.title}
      fill
      className="object-cover"
      sizes="(max-width: 768px) 100vw, 768px"
      priority
    />
  </div>
)}
```

**Step 3: Add source images collapsible**

After the source URL section at the bottom:

```typescript
{sourceImages.length > 0 && (
  <Collapsible>
    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ChevronDown className="h-4 w-4" />
      View original source ({sourceImages.length} {sourceImages.length === 1 ? 'image' : 'images'})
    </CollapsibleTrigger>
    <CollapsibleContent className="mt-3 space-y-3">
      {sourceImages.map((img) => (
        <div key={img.id} className="relative overflow-hidden rounded-lg border">
          <Image
            src={img.url}
            alt="Original recipe source"
            width={768}
            height={1024}
            className="w-full object-contain"
          />
        </div>
      ))}
    </CollapsibleContent>
  </Collapsible>
)}
```

**Step 4: Run `npm run build` and verify**

**Step 5: Commit**

```
feat: add hero image and source image viewer to recipe detail
```

---

### Task 9: Save Source Images on Recipe Creation

**Files:**
- Modify: `src/components/features/recipe-form.tsx`
- Modify: `src/app/api/recipes/route.ts` (POST handler)

**Step 1: Hold source images in form state**

In `recipe-form.tsx`, after successful extraction, store the original files:

- Add state: `const [sourceFiles, setSourceFiles] = useState<File[]>([])`
- After extraction succeeds, set: `setSourceFiles([...selectedFiles])`

**Step 2: Upload source images after recipe creation**

After recipe creation succeeds (res.ok), upload source images:

```typescript
if (res.ok) {
  const recipe = await res.json()

  // Upload source images if we have them
  if (sourceFiles.length > 0) {
    const uploadPromises = sourceFiles.map(async (file) => {
      const formData = new FormData()
      formData.append('image', file)
      formData.append('type', 'source')
      return fetch(`/api/recipes/${recipe.id}/images`, {
        method: 'POST',
        body: formData,
      })
    })
    await Promise.all(uploadPromises)
  }

  router.push(`/recipes/${recipe.id}`)
  router.refresh()
}
```

**Step 3: Run `npm run build` and verify end-to-end**

**Step 4: Commit**

```
feat: save source images when creating recipes from extraction
```

---

### Task 10: Final Polish & Verification

**Files:**
- Various — cleanup pass

**Step 1: Check for remaining hardcoded color classes**

Search for `bg-white`, `bg-gray`, `text-gray` across all components. Replace with theme variables.

**Step 2: Test mobile viewport**

- Verify hamburger drawer opens/closes
- Verify recipe list is single column on mobile
- Verify recipe form fields stack on mobile
- Verify recipe detail is readable on mobile

**Step 3: Test theme**

- Verify warm colors render throughout
- Verify sidebar contrast is good
- Verify cards, buttons, inputs all use theme

**Step 4: Run full test suite**

Run: `npx vitest run`

**Step 5: Run build**

Run: `npm run build`

**Step 6: Commit any remaining fixes**

```
fix: clean up hardcoded colors and mobile edge cases
```
