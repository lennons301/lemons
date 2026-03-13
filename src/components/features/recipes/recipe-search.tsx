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
import type { Person } from '@/types/person'

const MAX_QUICK_TAGS = 5

interface TagCount {
  name: string
  count: number
}

interface RecipeSearchProps {
  tagCounts: TagCount[]
  activeTag: string | null
  persons?: Person[]
  activeMember?: string | null
}

export function RecipeSearch({ tagCounts, activeTag, persons = [], activeMember = null }: RecipeSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')
  const [filterOpen, setFilterOpen] = useState(false)

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/recipes?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams('search', searchValue || null)
  }

  const quickTags = tagCounts.slice(0, MAX_QUICK_TAGS)
  const hasMoreTags = tagCounts.length > MAX_QUICK_TAGS
  const hasActiveFilters = activeTag !== null || activeMember !== null
  // Active tag is in the overflow (not in quick tags)
  const activeTagInOverflow = activeTag && !quickTags.some(t => t.name === activeTag)

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
              updateParams('search', null)
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
              variant={tag.name === activeTag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => updateParams('tag', tag.name === activeTag ? null : tag.name)}
            >
              {tag.name}
            </Badge>
          ))}
          {activeTagInOverflow && (
            <Badge
              variant="default"
              className="cursor-pointer"
              onClick={() => updateParams('tag', null)}
            >
              {activeTag}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          )}
          {(hasMoreTags || persons.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Filters
              {hasActiveFilters && (
                <span className="bg-primary text-primary-foreground ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                  {(activeTag ? 1 : 0) + (activeMember ? 1 : 0)}
                </span>
              )}
            </Button>
          )}
        </div>
      )}

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Filter Recipes</SheetTitle>
            <SheetDescription>
              Filter by tags and household members
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 overflow-y-auto p-4">
            {tagCounts.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tagCounts.map((tag) => (
                    <Badge
                      key={tag.name}
                      variant={tag.name === activeTag ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        updateParams('tag', tag.name === activeTag ? null : tag.name)
                      }}
                    >
                      {tag.name}
                      <span className="ml-1 opacity-60">{tag.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {persons.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Suitable for</h3>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={activeMember === 'everyone' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => updateParams('member', activeMember === 'everyone' ? null : 'everyone')}
                  >
                    Everyone
                  </Badge>
                  {persons.map((person) => (
                    <Badge
                      key={person.id}
                      variant={person.id === activeMember ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => updateParams('member', person.id === activeMember ? null : person.id)}
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
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete('tag')
                  params.delete('member')
                  router.push(`/recipes?${params.toString()}`)
                }}
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
