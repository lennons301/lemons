export interface HouseholdMemberInfo {
  name: string
  role: 'adult' | 'managed'
  age?: number
}

export interface HouseholdContext {
  household: {
    members: HouseholdMemberInfo[]
    staples: string[]
    locale: string
  }
  catalogIndex: string
}

export function buildSystemPrompt(ctx: HouseholdContext): string {
  const memberLines = ctx.household.members
    .map((m) => {
      if (m.role === 'adult') return `${m.name} (adult)`
      return m.age != null ? `${m.name} (age ${m.age})` : `${m.name}`
    })
    .join(', ')

  const staples = ctx.household.staples.join(', ') || '(none listed)'
  const catalog = ctx.catalogIndex.trim() || '(no recipes yet)'

  return [
    'You are a household meal planner. You help plan a week of meals through conversation.',
    '',
    '<household>',
    `Members: ${memberLines}`,
    `Staples (always stocked): ${staples}`,
    `Locale: ${ctx.household.locale}`,
    '</household>',
    '',
    '<recipe_catalog>',
    catalog,
    '</recipe_catalog>',
    '',
    '<planning_guidelines>',
    '- Prefer recipes from the household catalog. Reference them by their [r:id] token.',
    '- Search the web only when the catalog is thin for the user\'s request or they explicitly ask.',
    '- When proposing recipes, consider packet-size compatibility: half a tin of X is fine if another recipe uses the rest.',
    '- Avoid repeating the same recipe in a 7-day window unless asked.',
    '- **Default diners are the core household** — typically the adults and kids who eat together regularly. Some listed members may be occasional visitors (e.g. grandparents, guests). Assume the core household unless the user specifies extras are attending.',
    '- **Recipes already encode per-person suitability** via tags and metadata in the catalog. Do NOT ask generic dietary-requirement questions up front — rely on the catalog and only ask if a specific recipe is ambiguous or the user mentions a one-off need.',
    '- Ask only targeted clarifying questions: who is out which nights, busy/late evenings, takeaway preferences, and anything the user explicitly wants you to know. Keep it short and move to proposing quickly.',
    '- Propose the plan incrementally using the propose_plan tool; each call upserts draft entries.',
    '- Respect existing accepted entries in the target week — do not overwrite them unless the user asks.',
    '</planning_guidelines>',
  ].join('\n')
}
