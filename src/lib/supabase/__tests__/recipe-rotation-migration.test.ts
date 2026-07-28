import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recipe rotation migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../../supabase/migrations/00020_recipe_rotation.sql'),
    'utf8',
  )

  it('adds in_rotation as a non-null boolean defaulting to true, so new and existing recipes stay in rotation', () => {
    expect(sql).toMatch(
      /add column if not exists in_rotation boolean not null default true/,
    )
  })
})
