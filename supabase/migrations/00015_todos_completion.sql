-- 00015_todos_completion.sql
-- Adds: is_template + event_id to todo_lists, group_name to todo_items

-- Template flag
ALTER TABLE todo_lists ADD COLUMN is_template boolean NOT NULL DEFAULT false;

-- Event linking
ALTER TABLE todo_lists ADD COLUMN event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

-- One list per event
CREATE UNIQUE INDEX idx_todo_lists_event_id ON todo_lists (event_id) WHERE event_id IS NOT NULL;

-- Templates cannot be linked to events
ALTER TABLE todo_lists ADD CONSTRAINT chk_template_no_event
  CHECK (NOT (is_template = true AND event_id IS NOT NULL));

-- Item groups
ALTER TABLE todo_items ADD COLUMN group_name text;

-- Index for My Tasks query (assigned_to on pending items)
CREATE INDEX idx_todo_items_assigned_to ON todo_items (assigned_to) WHERE status != 'completed';
