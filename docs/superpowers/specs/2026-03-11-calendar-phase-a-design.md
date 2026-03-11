# Calendar Phase A — Event CRUD + Month/Week Views

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Phase A of Calendar (Build Order Step 6). Phase B (RRULE recurrence, single-instance editing, agenda view, drag/resize) and Phase C (meal plan integration, reminders, event-linked todo lists) are separate specs.

## Overview

Add a shared household calendar with month and week views. Users can create, edit, and delete events with categories, time/all-day support, multi-day spans, person assignment, and location. Month view is the default landing (wall-calendar replacement), week view provides time-slot detail.

## Data Model

### calendar_events (new table)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| household_id | uuid | FK → households, NOT NULL, RLS |
| title | text | NOT NULL |
| description | text | Nullable |
| start_datetime | timestamptz | NOT NULL |
| end_datetime | timestamptz | Nullable (null = single all-day or point-in-time event) |
| all_day | boolean | NOT NULL, default false |
| location | text | Nullable |
| assigned_to | uuid[] | Array of person IDs from household_persons. Default empty array. |
| created_by | uuid | FK → profiles, NOT NULL |
| category | text | NOT NULL, CHECK (category IN ('chore', 'appointment', 'birthday', 'holiday', 'social', 'custom')) |
| metadata | jsonb | Nullable, flexible extra data |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Indexes:** `idx_calendar_events_household` on (household_id), `idx_calendar_events_date_range` on (household_id, start_datetime, end_datetime) for range queries, `idx_calendar_events_assigned` GIN index on (assigned_to) for future "my events" queries.

**RLS:** Same household pattern as all other tables.

**Trigger:** `calendar_events_updated_at` using existing `update_updated_at()` function.

**Deferred to Phase B/C:** `recurrence_rule` (text), `recurrence_exceptions` (date[]), `parent_event_id` (uuid FK → self), `reminders` (jsonb), `color` (text, per-event override).

**Category note:** The original design lists `meal` as a category — this is excluded from Phase A and will be added in Phase C (meal plan integration) via an ALTER TABLE to update the CHECK constraint. `social` is a new addition not in the original design.

### Multi-day events

**Exclusive end convention** (matches iCalendar DTEND semantics): `end_datetime` is the first moment *after* the event ends.

For all-day multi-day events (e.g. "Easter hols Wed-Sun"):
- `all_day = true`
- `start_datetime = Wed 00:00:00 UTC`
- `end_datetime = Mon 00:00:00 UTC` (day after last day — exclusive end)

For timed events: `end_datetime` is the end time (e.g. 2pm-4pm → `end_datetime = 4pm`). This is naturally exclusive.

Single all-day events: `all_day = true`, `start_datetime = day 00:00:00`, `end_datetime = day+1 00:00:00`. Always store both start and end for consistent query patterns.

**Database constraint:** `CHECK (end_datetime IS NULL OR end_datetime > start_datetime)`.

### Date range query

Both month and week views use the same query pattern. Range boundaries are **exclusive end**: for a March month view, `rangeStart = 2026-03-01T00:00:00Z`, `rangeEnd = 2026-04-01T00:00:00Z`.

```
WHERE household_id = :id
  AND start_datetime < :rangeEnd
  AND end_datetime > :rangeStart
```

This captures all events overlapping the visible range, including multi-day events that start before or end after the window. Works for both all-day and timed events because `end_datetime` is always set.

### Timezone handling

Phase A uses the browser's local timezone for all display. `timestamptz` values are rendered in the user's local time via JS `Date`. All-day events are stored at midnight UTC — rendering should extract the date component and display as a full-day event regardless of timezone offset. Household timezone preference is deferred to a later phase.

## Category → Amalfi Color Mapping

Fixed colors per category. No per-event color override in Phase A.

| Category | Color Name | Hex |
|----------|-----------|-----|
| Appointment | Mediterranean | #4A90A4 |
| Birthday | Bougainvillea | #C97BB6 |
| Holiday | Lemon | #F2CC8F |
| Chore | Sage | #81B29A |
| Social | Peach | #E8A87C |
| Custom | Twilight | #3D405B |

## Month View (Default)

### Layout
- **Header**: Month/year title, prev/next arrows, "Today" button, Month/Week segmented toggle, "+ Event" button
- **Day headers**: Mon-Sun row
- **Grid**: 7-column grid, 5-6 rows depending on month. Monday start.
- **Today**: Date number highlighted with accent-colored circle
- **Outside days**: Previous/next month days shown at reduced opacity

### Event Pills
- Category-colored background with white text
- Truncated title. Timed events prefix with time ("10am Dentist")
- Max 2-3 visible per day cell. "+N more" link when overflow, clicking shows all events for that day.
- Multi-day events render as bars spanning across cells with rounded start/end caps

### Interactions
- **Click empty area of day cell**: Opens create event dialog pre-filled with that date, all-day = true
- **Click event pill**: Opens edit event dialog for that event
- **Click "+N more"**: Shows popover or expands to show all events for that day

## Week View

### Layout
- **Same header** as month view with "Week" toggle active
- **All-day bar**: Row above time grid for all-day and multi-day events, rendered as pills
- **Day headers**: Mon-Sun with date numbers. Today highlighted.
- **Time grid**: Scrollable vertical grid, hours 0-23. Each hour row = 48px. Auto-scroll to 8am on load (or earliest event).

### Timed Event Blocks
- Category-colored blocks positioned absolutely by start time
- Height proportional to duration (48px per hour)
- Shows title + time range text
- Click opens edit dialog

### Overlapping Events
When two timed events overlap in the same time slot on the same day, they render side-by-side, each taking an equal fraction of the column width.

### Interactions
- **Click empty time slot**: Opens create dialog with date + time pre-filled, all-day = false
- **Click event block**: Opens edit dialog
- **Click all-day pill**: Opens edit dialog

## Event Dialog (Create/Edit)

### Fields
- **Title** (text input, required)
- **Category** (select: appointment/birthday/holiday/chore/social/custom)
- **All-day toggle** (switch, default: true for month-click, false for week-click)
- **Start date** (date input, required)
- **Start time** (time input, shown only when not all-day)
- **End date** (date input, optional — for multi-day events)
- **End time** (time input, shown only when not all-day and end date is set)
- **Assigned to** (multi-select from household persons, optional)
- **Location** (text input, optional)
- **Description** (textarea, optional)

### Behavior
- Creating from month view: pre-fills start date, all-day = true
- Creating from week time slot: pre-fills start date + time, all-day = false
- Editing: all fields populated from existing event
- Delete button with confirmation (only in edit mode)

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/calendar?householdId=uuid&start=date&end=date | Fetch events overlapping date range |
| POST | /api/calendar | Create event |
| PUT | /api/calendar/[id] | Update event (all fields) |
| DELETE | /api/calendar/[id] | Delete event |

All routes authenticate via Supabase session and enforce household membership via RLS.

**GET query:** Uses the date range overlap query described in the data model section. `start` and `end` are ISO date strings.

**POST validation:** `title` (required, non-empty), `start_datetime` (required), `end_datetime` (required, must be after start_datetime), `category` (required, must be valid), `household_id` (required).

**Empty states:** Month/week views with no events show the grid normally — no special empty state needed since the grid itself is useful context. The "+ Event" button and click-to-create provide clear entry points.

**Assignee validation:** `assigned_to` is validated at the application level — each UUID should be a valid person in the household_persons view. For Phase A, we trust the client (RLS prevents cross-household access).

## Components

| File | Type | Purpose |
|------|------|---------|
| `src/app/(dashboard)/calendar/page.tsx` | Server | Fetches initial month of events, renders calendar-view |
| `src/components/features/calendar/calendar-view.tsx` | Client | Main component: month/week toggle, navigation, date state, event fetching |
| `src/components/features/calendar/month-grid.tsx` | Client | Month grid: day cells, event pills, multi-day bars, overflow |
| `src/components/features/calendar/week-grid.tsx` | Client | Week time grid: all-day bar, hourly rows, timed event blocks |
| `src/components/features/calendar/event-pill.tsx` | Client | Single event pill for month view |
| `src/components/features/calendar/event-block.tsx` | Client | Single timed event block for week view |
| `src/components/features/calendar/event-dialog.tsx` | Client | Create/edit event dialog |
| `src/types/calendar.ts` | Types | CalendarEvent, categories, category colors |

## Types

```typescript
export interface CalendarEvent {
  id: string
  household_id: string
  title: string
  description: string | null
  start_datetime: string
  end_datetime: string | null
  all_day: boolean
  location: string | null
  assigned_to: string[]
  created_by: string
  category: EventCategory
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type EventCategory = 'chore' | 'appointment' | 'birthday' | 'holiday' | 'social' | 'custom'

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'chore', label: 'Chore' },
  { value: 'social', label: 'Social' },
  { value: 'custom', label: 'Custom' },
]

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  appointment: '#4A90A4',
  birthday: '#C97BB6',
  holiday: '#F2CC8F',
  chore: '#81B29A',
  social: '#E8A87C',
  custom: '#3D405B',
}
```

## Date Utilities

No external date library. Plain JS Date for:
- Computing which day of the week a month starts on
- How many weeks to display in the month grid
- Generating the array of day cells (including padding days from prev/next month)
- Week start/end dates from a given date
- Checking if an event overlaps a specific day (for rendering pills)
- Formatting times and dates for display

These utilities live in the calendar components or a small `src/lib/utils/calendar.ts` if shared across components.

## Out of Scope (Phase B/C)

- RRULE recurrence and single-instance editing
- Agenda view
- Drag-to-reschedule and resize-to-change-duration
- Meal plan integration (composite query)
- Reminders (in-app + browser push)
- Event-linked todo lists
- Per-event color override
