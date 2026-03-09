'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { type Person } from '@/components/features/member-picker'

interface RecipeSearchProps {
  allTags: string[]
  activeTag: string | null
  persons?: Person[]
  activeMember?: string | null
}

export function RecipeSearch({ allTags, activeTag, persons = [], activeMember = null }: RecipeSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')

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
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={tag === activeTag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => updateParams('tag', tag === activeTag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {persons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground mr-1 text-xs">Suitable for:</span>
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
      )}
    </div>
  )
}
