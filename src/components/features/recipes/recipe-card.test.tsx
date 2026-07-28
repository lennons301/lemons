import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RecipeCard } from './recipe-card'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

function makeRecipe(overrides: Partial<Parameters<typeof RecipeCard>[0]['recipe']> = {}) {
  return {
    id: 'r1',
    title: 'Lemon Chicken',
    description: null,
    servings: 4,
    prep_time: 10,
    cook_time: 20,
    recipe_tags: [],
    recipe_images: [],
    ...overrides,
  }
}

describe('RecipeCard', () => {
  it('shows the "Out of rotation" badge when the recipe is out of rotation', () => {
    render(<RecipeCard recipe={makeRecipe({ in_rotation: false })} />)
    expect(screen.getByText('Out of rotation')).toBeInTheDocument()
  })

  it('does not show the badge when the recipe is in rotation', () => {
    render(<RecipeCard recipe={makeRecipe({ in_rotation: true })} />)
    expect(screen.queryByText('Out of rotation')).not.toBeInTheDocument()
  })

  it('does not show the badge when rotation state is missing (default is in rotation)', () => {
    render(<RecipeCard recipe={makeRecipe()} />)
    expect(screen.queryByText('Out of rotation')).not.toBeInTheDocument()
  })

  it('has a quick action to take an in-rotation recipe out of rotation', () => {
    render(<RecipeCard recipe={makeRecipe({ in_rotation: true })} />)
    expect(screen.getByRole('button', { name: 'Take out of rotation' })).toBeInTheDocument()
  })

  it('has a quick action to return an out-of-rotation recipe to rotation', () => {
    render(<RecipeCard recipe={makeRecipe({ in_rotation: false })} />)
    expect(screen.getByRole('button', { name: 'Return to rotation' })).toBeInTheDocument()
  })

  it('keeps the quick action outside the card link so it works without opening the recipe', () => {
    render(<RecipeCard recipe={makeRecipe({ in_rotation: true })} />)
    const button = screen.getByRole('button', { name: 'Take out of rotation' })
    expect(button.closest('a')).toBeNull()
  })
})
