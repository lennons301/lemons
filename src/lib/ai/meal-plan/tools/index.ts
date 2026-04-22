// Tool dispatcher: input is `unknown` at the SDK boundary and narrowed by
// each tool's own input validation.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MealGenToolName } from '@/types/meal-gen'
import type { ToolContext, ToolResult } from '../types'
import { checkPacketSizes } from './check-packet-sizes'
import { getRecipe } from './get-recipe'
import { searchInventoryLeftovers } from './search-inventory-leftovers'
import { getCalendarEvents } from './get-calendar-events'
import { proposePlan } from './propose-plan'
import { removeSlot } from './remove-slot'
import { scrapeAndSaveRecipe } from './scrape-and-save-recipe'

export type ToolImpl = (ctx: ToolContext, input: any) => Promise<ToolResult>

export const TOOL_REGISTRY: Record<MealGenToolName, ToolImpl> = {
  check_packet_sizes: checkPacketSizes as ToolImpl,
  get_recipe: getRecipe as ToolImpl,
  search_inventory_leftovers: searchInventoryLeftovers as ToolImpl,
  get_calendar_events: getCalendarEvents as ToolImpl,
  propose_plan: proposePlan as ToolImpl,
  remove_slot: removeSlot as ToolImpl,
  scrape_and_save_recipe: scrapeAndSaveRecipe as ToolImpl,
}

export async function dispatchTool(
  name: MealGenToolName | string,
  ctx: ToolContext,
  input: unknown,
  registry: Record<string, ToolImpl> = TOOL_REGISTRY,
): Promise<ToolResult> {
  const impl = registry[name]
  if (!impl) {
    return { content: { error: `Unknown tool: ${name}` }, is_error: true }
  }
  return impl(ctx, input as any)
}
