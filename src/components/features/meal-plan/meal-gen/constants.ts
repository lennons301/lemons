export const SUGGESTED_PROMPTS: string[] = [
  'Plan 4 dinners this week, nothing too heavy',
  "Tuesday we're out — skip dinner that night",
  'Something veggie for Wednesday',
  "Use what we've got in the freezer",
  'Something quick for 2 adults + 2 kids (ages 4 and 7)',
]

// Tool names mapped to a short human label + emoji for chat-chip display.
export const TOOL_LABELS: Record<string, { label: string; emoji: string }> = {
  get_recipe: { label: 'looked up recipe', emoji: '📖' },
  scrape_and_save_recipe: { label: 'saved a web recipe', emoji: '🌐' },
  search_inventory_leftovers: { label: 'checked leftovers', emoji: '🧊' },
  get_calendar_events: { label: 'checked calendar', emoji: '📅' },
  check_packet_sizes: { label: 'checked packet sizes', emoji: '📦' },
  propose_plan: { label: 'proposed slots', emoji: '✨' },
  remove_slot: { label: 'removed a slot', emoji: '🗑️' },
  web_search: { label: 'searched the web', emoji: '🔍' },
}
