'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MemberPicker } from '@/components/features/members/member-picker'
import { Loader2, Minus, Plus } from 'lucide-react'
import type { Person } from '@/types/person'

interface AddMealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  date: string
  mealType: string
  persons: Person[]
  editingEntry?: any | null
  onSave: (entry: {
    recipe_id?: string
    custom_name?: string
    servings: number
    assigned_to: string[]
    notes?: string
  }) => Promise<void>
}

export function AddMealDialog({
  open, onOpenChange, householdId, date, mealType, persons, editingEntry, onSave,
}: AddMealDialogProps) {
  const [tab, setTab] = useState<'recipe' | 'custom'>(
    editingEntry?.recipe_id ? 'recipe' : editingEntry?.custom_name ? 'custom' : 'recipe'
  )
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipes, setRecipes] = useState<any[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    editingEntry?.recipe_id || null
  )
  const [customName, setCustomName] = useState(editingEntry?.custom_name || '')
  const [servings, setServings] = useState(editingEntry?.servings || 2)
  const [assignedTo, setAssignedTo] = useState<string[]>(editingEntry?.assigned_to || [])
  const [notes, setNotes] = useState(editingEntry?.notes || '')
  const [saving, setSaving] = useState(false)
  const [loadingRecipes, setLoadingRecipes] = useState(false)

  // Fetch recipes for search
  useEffect(() => {
    if (!open || !householdId) return
    setLoadingRecipes(true)
    fetch(`/api/recipes?householdId=${householdId}&search=${encodeURIComponent(recipeSearch)}`)
      .then((r) => r.json())
      .then((data) => setRecipes(Array.isArray(data) ? data : []))
      .catch(() => setRecipes([]))
      .finally(() => setLoadingRecipes(false))
  }, [open, householdId, recipeSearch])

  // Reset form when opening with new entry
  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setTab(editingEntry.recipe_id ? 'recipe' : 'custom')
        setSelectedRecipeId(editingEntry.recipe_id || null)
        setCustomName(editingEntry.custom_name || '')
        setServings(editingEntry.servings || 2)
        setAssignedTo(editingEntry.assigned_to || [])
        setNotes(editingEntry.notes || '')
      } else {
        setTab('recipe')
        setSelectedRecipeId(null)
        setCustomName('')
        setServings(2)
        setAssignedTo([])
        setNotes('')
      }
      setRecipeSearch('')
    }
  }, [open, editingEntry])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        recipe_id: tab === 'recipe' ? selectedRecipeId || undefined : undefined,
        custom_name: tab === 'custom' ? customName.trim() || undefined : undefined,
        servings,
        assigned_to: assignedTo,
        notes: notes.trim() || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const canSave = tab === 'recipe' ? !!selectedRecipeId : !!customName.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden !gap-0 !p-0 max-h-[92dvh] sm:max-h-[85dvh] top-auto bottom-0 left-0 right-0 translate-x-0 translate-y-0 max-w-full rounded-b-none sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:right-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:rounded-b-lg">
        <div className="flex flex-col max-h-[92dvh] sm:max-h-[85dvh]">
          <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <DialogTitle>
              {editingEntry ? 'Edit Meal' : 'Add Meal'} — {mealType} on {date}
            </DialogTitle>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 min-h-0">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'recipe' | 'custom')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="recipe">From Recipe</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>

              <TabsContent value="recipe" className="space-y-3">
                <Input
                  placeholder="Search recipes..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                />
                <div className="max-h-32 sm:max-h-36 overflow-y-auto space-y-1">
                  {loadingRecipes && <p className="text-sm text-muted-foreground p-2">Loading...</p>}
                  {!loadingRecipes && recipes.length === 0 && (
                    <p className="text-sm text-muted-foreground p-2">No recipes found</p>
                  )}
                  {recipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedRecipeId === recipe.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => {
                        setSelectedRecipeId(recipe.id)
                        setServings(recipe.servings || 2)
                      }}
                    >
                      {recipe.title}
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="custom" className="space-y-3">
                <div>
                  <Label htmlFor="custom-name">Meal Name</Label>
                  <Input
                    id="custom-name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Leftovers, Eating out"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-3 pt-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Servings</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setServings(Math.max(1, servings - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{servings}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setServings(servings + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              {persons.length > 0 && (
                <div>
                  <Label>Assign to</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    Leave empty for whole household
                  </p>
                  <div className="max-h-28 overflow-y-auto">
                    <MemberPicker
                      persons={persons}
                      selected={assignedTo}
                      onChange={setAssignedTo}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end px-4 pb-4 pt-3 sm:px-6 sm:pb-6 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingEntry ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
