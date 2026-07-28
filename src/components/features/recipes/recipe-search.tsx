'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import {
  EVERYONE,
  countActiveFilters,
  parseRecipeFilters,
  serializeRecipeFilters,
  type RecipeFilterState,
  type RotationFilter,
} from '@/lib/utils/recipe-filters'
import type { Person } from '@/types/person'

const MAX_QUICK_TAGS = 5

const ROTATION_OPTIONS: { value: RotationFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In rotation' },
  { value: 'out', label: 'Out of rotation' },
]

interface TagCount {
  name: string
  count: number
}

interface RecipeSearchProps {
  tagCounts: TagCount[]
  persons?: Person[]
  filters: RecipeFilterState
}

export function RecipeSearch({ tagCounts, persons = [], filters }: RecipeSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(filters.search)
  const [filterOpen, setFilterOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')

  const applyFilters = useCallback(
    (next: Partial<RecipeFilterState>) => {
      const current = parseRecipeFilters(Object.fromEntries(searchParams.entries()))
      const params = serializeRecipeFilters({ ...current, ...next }, searchParams)
      router.push(`/recipes?${params.toString()}`)
    },
    [router, searchParams]
  )

  const toggleTag = (name: string) => {
    applyFilters({
      tags: filters.tags.includes(name)
        ? filters.tags.filter((t) => t !== name)
        : [...filters.tags, name],
    })
  }

  const toggleMember = (id: string) => {
    if (id === EVERYONE) {
      // Everyone supersedes individual selections
      applyFilters({ members: filters.members.includes(EVERYONE) ? [] : [EVERYONE] })
    } else if (filters.members.includes(EVERYONE)) {
      applyFilters({ members: [id] })
    } else {
      applyFilters({
        members: filters.members.includes(id)
          ? filters.members.filter((m) => m !== id)
          : [...filters.members, id],
      })
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters({ search: searchValue })
  }

  const activeCount = countActiveFilters(filters)
  const tagCountMap = new Map(tagCounts.map((t) => [t.name, t.count]))
  const quickTags = tagCounts.slice(0, MAX_QUICK_TAGS)
  // Selected tags outside the quick strip stay visible next to it
  const selectedOverflowTags = filters.tags.filter(
    (name) => !quickTags.some((t) => t.name === name)
  )
  const unselectedTags = tagCounts.filter((t) => !filters.tags.includes(t.name))
  const visibleUnselectedTags = tagQuery
    ? unselectedTags.filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase()))
    : unselectedTags

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search recipes..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => {
              setSearchValue('')
              applyFilters({ search: '' })
            }}
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {(tagCounts.length > 0 || persons.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {quickTags.map((tag) => (
            <Badge
              key={tag.name}
              variant={filters.tags.includes(tag.name) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleTag(tag.name)}
            >
              {tag.name}
              <span className="ml-1 opacity-60">{tag.count}</span>
            </Badge>
          ))}
          {selectedOverflowTags.map((name) => (
            <Badge
              key={name}
              variant="default"
              className="cursor-pointer"
              onClick={() => toggleTag(name)}
            >
              {name}
              <span className="ml-1 opacity-60">{tagCountMap.get(name) ?? 0}</span>
              <X className="ml-1 h-3 w-3" />
            </Badge>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filters
            {activeCount > 0 && (
              <span className="bg-primary text-primary-foreground ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                {activeCount}
              </span>
            )}
          </Button>
        </div>
      )}

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Filter Recipes</SheetTitle>
            <SheetDescription>
              Filter by tags, household members, and rotation
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 overflow-y-auto p-4">
            {tagCounts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Tags</h3>
                {filters.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {filters.tags.map((name) => (
                      <Badge
                        key={name}
                        variant="default"
                        className="cursor-pointer"
                        onClick={() => toggleTag(name)}
                      >
                        {name}
                        <span className="ml-1 opacity-60">{tagCountMap.get(name) ?? 0}</span>
                        <X className="ml-1 h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Search tags..."
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  className="h-8"
                />
                <div className="flex flex-wrap gap-1.5">
                  {visibleUnselectedTags.map((tag) => (
                    <Badge
                      key={tag.name}
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => toggleTag(tag.name)}
                    >
                      {tag.name}
                      <span className="ml-1 opacity-60">{tag.count}</span>
                    </Badge>
                  ))}
                  {visibleUnselectedTags.length === 0 && (
                    <p className="text-muted-foreground text-xs">No tags match.</p>
                  )}
                </div>
              </div>
            )}
            {persons.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Suitable for</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={filters.members.includes(EVERYONE) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleMember(EVERYONE)}
                  >
                    Everyone
                  </Badge>
                  {persons.map((person) => (
                    <Badge
                      key={person.id}
                      variant={filters.members.includes(person.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleMember(person.id)}
                    >
                      <span
                        className={`mr-1 inline-block h-2 w-2 rounded-full ${getMemberBgClass(person.id)}`}
                      />
                      {person.display_name || 'Unknown'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Rotation</h3>
              <div className="flex flex-wrap gap-1.5">
                {ROTATION_OPTIONS.map((option) => (
                  <Badge
                    key={option.value}
                    variant={filters.rotation === option.value ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => applyFilters({ rotation: option.value })}
                  >
                    {option.label}
                  </Badge>
                ))}
              </div>
            </div>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFilters({ tags: [], members: [], rotation: 'all' })}
              >
                Clear all filters
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
