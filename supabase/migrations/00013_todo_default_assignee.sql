-- Migration: 00013_todo_default_assignee.sql
-- Add default_assigned_to and updated_at to todo_lists

ALTER TABLE public.todo_lists ADD COLUMN default_assigned_to uuid;
ALTER TABLE public.todo_lists ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER todo_lists_updated_at
  BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
