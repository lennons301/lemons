import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeSearch } from './recipe-search'
import type { RecipeFilterState } from '@/lib/utils/recipe-filters'

afterEach(cleanup)

const push = vi.fn()
let currentParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => currentParams,
}))

const noFilters: RecipeFilterState = { search: '', tags: [], members: [], rotation: 'all' }

const tagCounts = [
  { name: 'quick', count: 5 },
  { name: 'veggie', count: 4 },
  { name: 'dinner', count: 3 },
  { name: 'lunch', count: 2 },
  { name: 'baking', count: 2 },
  { name: 'slow-cooker', count: 1 },
]

const persons = [
  { id: 'p1', display_name: 'Ada' },
  { id: 'p2', display_name: 'Ben' },
]

function pushedParams(): URLSearchParams {
  expect(push).toHaveBeenCalled()
  const url: string = push.mock.calls[push.mock.calls.length - 1][0]
  return new URLSearchParams(url.split('?')[1])
}

async function openSheet() {
  await userEvent.click(screen.getByRole('button', { name: /Filters/ }))
}

describe('RecipeSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentParams = new URLSearchParams()
  })

  it('adds a quick-strip tag to the existing selection (multi-select)', async () => {
    currentParams = new URLSearchParams('tags=quick')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, tags: ['quick'] }}
      />
    )

    await userEvent.click(screen.getByText('veggie'))

    expect(pushedParams().get('tags')).toBe('quick,veggie')
  })

  it('removes a selected quick-strip tag when clicked again', async () => {
    currentParams = new URLSearchParams('tags=quick,veggie')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, tags: ['quick', 'veggie'] }}
      />
    )

    await userEvent.click(screen.getByText('quick'))

    expect(pushedParams().get('tags')).toBe('veggie')
  })

  it('shows a selected tag from the sheet next to the quick strip', () => {
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, tags: ['slow-cooker'] }}
      />
    )

    expect(screen.getByText('slow-cooker')).toBeInTheDocument()
  })

  it('narrows the sheet tag list as you type, keeping selected tags pinned', async () => {
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, tags: ['quick'] }}
      />
    )
    await openSheet()

    await userEvent.type(screen.getByPlaceholderText('Search tags...'), 'bak')

    const sheet = within(screen.getByRole('dialog'))
    expect(sheet.getByText('baking')).toBeInTheDocument()
    expect(sheet.queryByText('veggie')).not.toBeInTheDocument()
    // Selected tag stays pinned even though it doesn't match the query
    expect(sheet.getByText('quick')).toBeInTheDocument()
  })

  it('adds a member to the existing selection (match-all multi-select)', async () => {
    currentParams = new URLSearchParams('members=p1')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, members: ['p1'] }}
      />
    )
    await openSheet()

    await userEvent.click(screen.getByText('Ben'))

    expect(pushedParams().get('members')).toBe('p1,p2')
  })

  it('selecting Everyone replaces individual member selections', async () => {
    currentParams = new URLSearchParams('members=p1')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, members: ['p1'] }}
      />
    )
    await openSheet()

    await userEvent.click(screen.getByText('Everyone'))

    expect(pushedParams().get('members')).toBe('everyone')
  })

  it('selecting a person while Everyone is active narrows to that person', async () => {
    currentParams = new URLSearchParams('members=everyone')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ ...noFilters, members: ['everyone'] }}
      />
    )
    await openSheet()

    await userEvent.click(screen.getByText('Ada'))

    expect(pushedParams().get('members')).toBe('p1')
  })

  it('sets the rotation facet from the sheet', async () => {
    render(<RecipeSearch tagCounts={tagCounts} persons={persons} filters={noFilters} />)
    await openSheet()

    await userEvent.click(screen.getByText('Out of rotation'))

    expect(pushedParams().get('rotation')).toBe('out')
  })

  it('shows the total active filter count on the Filters button', () => {
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ search: '', tags: ['quick', 'veggie'], members: ['p1'], rotation: 'out' }}
      />
    )

    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('4')
  })

  it('clears tags, members, and rotation but keeps the title search', async () => {
    currentParams = new URLSearchParams('search=curry&tags=quick&members=p1&rotation=out')
    render(
      <RecipeSearch
        tagCounts={tagCounts}
        persons={persons}
        filters={{ search: 'curry', tags: ['quick'], members: ['p1'], rotation: 'out' }}
      />
    )
    await openSheet()

    await userEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))

    const params = pushedParams()
    expect(params.get('tags')).toBeNull()
    expect(params.get('members')).toBeNull()
    expect(params.get('rotation')).toBeNull()
    expect(params.get('search')).toBe('curry')
  })
})
