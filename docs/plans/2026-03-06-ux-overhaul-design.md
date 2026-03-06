# UX Overhaul Design — Visual Theme, Mobile, Multi-Image Extraction, Recipe Images

## Context

Before moving to meal planning, four foundational UX issues need addressing:

1. Plain white stock styling — no visual identity
2. Unusable on mobile — sidebar takes full viewport
3. AI extraction limited to single image — can't handle multi-page recipes
4. Recipe images exist in DB but are never displayed

## 1. Visual Design — Warm Lemon Theme

Replace stock shadcn grayscale with a warm, kitchen-inspired palette.

- **Primary:** warm golden yellow (lemon) — buttons, active states, brand accent
- **Background:** warm off-white/cream — not stark white
- **Cards:** slightly warmer white with subtle warm-toned borders
- **Sidebar:** deep warm tone (charcoal with warm undertone or dark olive) — contrasts the light content area
- **Text:** warm near-black, muted text in warm gray (not blue-gray)
- **Destructive/error:** warm red (terracotta)
- **Fonts:** keep Geist Sans, update metadata title from "Create Next App" to "Lemons"

Implementation is mostly CSS variable changes in `globals.css` plus replacing hardcoded `bg-white`/`text-gray-*` classes in components.

## 2. Mobile Responsive Layout

### Sidebar to hamburger drawer

- Below `md` breakpoint (768px): sidebar hidden by default, slides in as overlay from left with backdrop
- Sticky top bar with hamburger icon, "Lemons" brand, and current page title
- Drawer contains same nav items, household switcher, and user menu
- Closes on: tap backdrop, tap X, or navigation
- Above `md`: current fixed sidebar layout unchanged

### Content area adjustments

- Reduce padding from `p-6` to `p-4` on mobile
- Recipe form: 3-column grid (servings/prep/cook) collapses to single column
- Recipe cards: 2-column grid on tablet, single column on mobile
- Recipe detail: already `max-w-3xl`, full-width on mobile

No new dependencies — state toggle, Tailwind responsive classes, backdrop div.

## 3. Multi-Image Extraction with Text Hint

### API changes (`/api/recipes/extract`)

- Accept multiple files (`images` field, up to 5) instead of single `image`
- Accept optional `hint` text field — e.g. "focus on the recipe in the top-right", "ingredients are on the first image, instructions on the second"
- All images sent as separate image blocks in a single Claude message
- Hint prepended to extraction prompt if provided

### UI changes (recipe form)

- Replace single file input with multi-file dropzone area
- Show thumbnails of selected images before submitting
- Optional text input: "Any instructions for the AI?" with placeholder examples
- Remove/reorder images before extracting
- Single "Extract" button (not auto-extract on file select)

### `extract-recipe.ts` changes

- Accept array of `{ base64, mediaType }` instead of single image
- Build message with multiple image blocks
- If hint provided, prepend: "User note: {hint}"

## 4. Recipe Images in UI

### Recipe card (list page)

- First `hero` or `photo` image as thumbnail at top of card (16:9 aspect, `object-cover`)
- If no images: warm-toned placeholder with subtle icon
- Lazy loading

### Recipe detail page

- Hero image at top, full-width within `max-w-3xl`, rounded corners
- If no images, no hero section (no placeholder on detail)
- Below recipe content: collapsible "Original source" section showing extraction source images (type `source` in `recipe_images`)

### Extraction flow — saving source images

- After extraction, hold original images in form state
- On recipe create, upload to Supabase Storage with type `source`
- Users can also upload `hero`/`photo` images separately via existing image upload API on edit page
