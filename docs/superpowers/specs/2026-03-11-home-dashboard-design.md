# Home Dashboard

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Home dashboard replacing the stub at `/`. Read-only aggregation page pulling from calendar events, todo items, meal plan entries, and inventory items.

## Overview

The home dashboard is the landing page after login. It shows a household-wide summary of what's happening today and this week, with a toggle to filter to the current user's assignments. No new tables or API routes — all data fetched server-side via Supabase.

## Layout

### Header
- **Greeting**: Time-of-day based — "Good morning" / "Good afternoon" / "Good evening" + user's display_name
- **Date**: Full date string ("Wednesday, 11 March 2026")
- **Toggle**: "Household" / "Just Me" segmented control. Defaults to Household. Client-side filter.

### Week Strip
- Horizontal 7-day strip (Mon-Sun of the current week)
- Each day shows: day name, date number
- **Today**: Highlighted with accent-colored background
- **Past days**: Dimmed opacity
- **Event dots**: Category-colored dots below each day showing event density (max 3 dots, using `CATEGORY_COLORS` from `@/types/calendar`)
- Tapping a day does nothing in this version — it's informational only

### Widget Grid
- 2-column grid on desktop/tablet, 1-column on mobile
- 4 widgets in order: Today's Events, Tasks Due, Today's Meals, Expiring Inventory

## Widgets

### Today's Events
- Shows all calendar events for today
- Each event: category-colored left border, title, time ("All day" or "1:00 – 2:30pm")
- Sorted: all-day events first, then by start time
- **Empty**: "No events today"
- **Link**: "View calendar" → `/calendar`

### Tasks Due
- Shows todo items that are overdue or due within the next 7 days, status != completed
- Each task: priority-colored checkbox border (red=high/urgent, amber=medium, blue=low), title, due badge (overdue/today/tomorrow/date)
- Sorted: overdue first, then due today, then due this week, then by priority
- Max 5 visible, "+N more" if overflow
- **Empty**: "No tasks due"
- **Link**: "View todos" → `/todos`
- Excludes items from shopping lists (`list_type != 'shopping'`)

### Today's Meals
- Shows meal plan entries for today's date
- Each meal: meal type label (Breakfast/Lunch/Dinner/Snack), recipe title or custom text
- Sorted by meal type order: breakfast → lunch → dinner → snack
- **Empty**: "No meals planned — Plan meals" (link to `/meal-plans`)
- **Link**: "View meal plan" → `/meal-plans`

### Expiring Inventory
- Shows inventory items with `expiry_date` within 3 days from today (and not null)
- Each item: display_name, expiry urgency badge (today/tomorrow/2 days/3 days)
- Sorted by expiry date ascending (most urgent first)
- Max 5 visible, "+N more" if overflow
- **Empty**: "Nothing expiring soon"
- **Link**: "View inventory" → `/inventory`

## "Just Me" Filter

Client-side filtering of server-fetched data. When "Just Me" is active:
- **Events**: Only events where `assigned_to` array includes the current user's person ID (unassigned events with empty `assigned_to` are still shown)
- **Tasks**: Only tasks where `assigned_to` equals the current user's person ID (unassigned tasks are still shown)
- **Meals**: Only meal plan entries assigned to the current user's person ID (household-wide entries are still shown)
- **Week strip dots**: Filtered to match the event filter
- **Inventory**: Not filtered (inventory is household-wide, no per-person assignment)

**Person ID lookup:** The `household_persons` view has both an `id` (the person row ID from `household_members`) and implicitly links to the user's `profile_id`. To find the current user's person ID, query `household_persons` and match rows where the underlying `household_members.user_id` equals the authenticated user's ID. The resulting `id` field is the person ID used in `assigned_to` arrays on calendar events and `assigned_to` on todo items. This is NOT the same as the user's `profile.id` — it is the `household_members.id`.

**Note on `assigned_to` types:** `calendar_events.assigned_to` is a `uuid[]` array. `todo_items.assigned_to` is a single `uuid`. The filter logic differs: array `includes()` for events, equality `===` for tasks.

## Data Queries (Server-Side)

All queries run in the server component. No new API routes needed.

**Events (this week):**
```
calendar_events WHERE household_id = :id
  AND start_datetime < :weekEnd AND end_datetime > :weekStart
ORDER BY start_datetime
```

**Tasks due (next 7 days + overdue, max 30 days back):**
```
todo_lists(*, todo_items(*))
WHERE household_id = :id AND list_type != 'shopping' AND archived = false
```
Then flatten in JS: filter `todo_items` where `status != 'completed'` and `due_date` is between 30 days ago and end of week. This follows the same Supabase nested-select pattern used by the todos landing page.

Priority `'none'` tasks show no colored border (neutral style).

**Meals (today):**
```
meal_plan_entries(*, recipes(id, title)) WHERE household_id = :id AND date = :today
```
Join recipes to get recipe titles. Entries with `recipe_id` display the recipe title; entries with `custom_name` display that instead.

**Inventory (expiring within 3 days):**
```
inventory_items WHERE household_id = :id
  AND expiry_date IS NOT NULL
  AND expiry_date <= :threeDaysFromNow
  AND expiry_date >= :today
ORDER BY expiry_date
```

**Household persons (for filter + assignee display):**
```
household_persons WHERE household_id = :id
```

## Components

| File | Type | Purpose |
|------|------|---------|
| `src/app/(dashboard)/page.tsx` | Server | Fetches all data, renders dashboard-view |
| `src/components/features/dashboard/dashboard-view.tsx` | Client | Main component: greeting, toggle, layout |
| `src/components/features/dashboard/week-strip.tsx` | Client | Horizontal 7-day strip with event dots |
| `src/components/features/dashboard/dashboard-widget.tsx` | Client | Reusable widget card (title, link, children) |

## Types

No new types file needed. The dashboard uses existing types:
- `CalendarEvent` from `@/types/calendar`
- `TodoItem` from `@/types/todos`
- `InventoryItem` from `@/types/inventory`
- Meal plan entries use inline types (matching the existing meal plan feature pattern)

## Greeting Logic

```
hour < 12  → "Good morning"
hour < 17  → "Good afternoon"
otherwise  → "Good evening"
```

Computed client-side to match the user's local time, not server time.

## Edge Cases

- **No household**: If user has no `default_household_id`, redirect to `/onboarding` (matches existing pattern in recipe pages).
- **No data**: Each widget shows its empty state message. The dashboard grid still renders — an empty dashboard is still useful for the week strip and quick navigation.
- **New user**: Same as no data — all widgets show empty states with contextual links to create content.
