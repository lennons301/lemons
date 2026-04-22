// Custom tool schemas in Anthropic tool-use format.
// The `web_search` tool is an Anthropic server-side tool — we just pass its config through.

interface ToolSchema {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'get_recipe',
    description: 'Fetch the full details of a household recipe by id, including ingredients, instructions, prep/cook times. Use this before proposing a recipe to confirm it fits the request.',
    input_schema: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe UUID as it appears in the catalog (the part after [r: in the catalog index)' },
      },
      required: ['recipe_id'],
    },
  },
  {
    name: 'scrape_and_save_recipe',
    description: 'Scrape a recipe from a URL and save it to the household catalog. Returns the new recipe_id. Use only after the user approves a web-found recipe.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to the recipe page.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_inventory_leftovers',
    description: 'List cooked-meal inventory items with remaining servings — leftovers from past cooking. Use these to plan reheats or portion-out meals.',
    input_schema: {
      type: 'object',
      properties: {
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Optional meal type filter. Omit to list all.' },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch calendar events in a date window so you can factor busy evenings into the plan (e.g. late pickups, parties).',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD inclusive.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'check_packet_sizes',
    description: 'Look up typical UK supermarket pack sizes for a list of ingredient names. Use while weighing recipe choices to prefer combinations that use up packs cleanly.',
    input_schema: {
      type: 'object',
      properties: {
        ingredient_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Normalized ingredient names (lowercase, singular), e.g. ["carrot", "chicken breast"].',
        },
      },
      required: ['ingredient_names'],
    },
  },
  {
    name: 'propose_plan',
    description: 'Upsert one or more draft meal-plan entries for the target week. Call this repeatedly as the plan evolves. Drafts do not become real entries until the user accepts.',
    input_schema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
              source: { type: 'string', enum: ['recipe', 'custom', 'custom_with_ingredients', 'leftover'] },
              recipe_id: { type: 'string', description: 'Required when source=recipe; leave unset otherwise.' },
              inventory_item_id: { type: 'string', description: 'Required when source=leftover.' },
              custom_name: { type: 'string', description: 'Required when source=custom or custom_with_ingredients.' },
              custom_ingredients: {
                type: 'array',
                description: 'Required when source=custom_with_ingredients. Ingredients to include on the shopping list.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: ['number', 'null'] },
                    unit: { type: ['string', 'null'] },
                  },
                  required: ['name'],
                },
              },
              servings: { type: 'number', description: 'Defaults to household size if omitted.' },
              assigned_to: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of person ids; empty = whole household.',
              },
              notes: { type: 'string' },
            },
            required: ['date', 'meal_type', 'source'],
          },
        },
      },
      required: ['entries'],
    },
  },
  {
    name: 'remove_slot',
    description: 'Remove a draft entry for a specific date and meal_type.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      },
      required: ['date', 'meal_type'],
    },
  },
]

// Anthropic server-side web search tool. The exact type string is what the
// SDK expects to pass through — runtime handling is on Anthropic's side.
// Check the SDK release notes if the tool type version needs bumping.
export const WEB_SEARCH_SERVER_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search' as const,
  max_uses: 10,
}
