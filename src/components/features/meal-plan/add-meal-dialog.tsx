'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MemberPicker } from '@/components/features/member-picker'
import { Loader2 } from 'lucide-react'

interface Person {
  id: string
  display_name: string | null
  date_of_birth: string | null
  person_type: string
}

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingEntry ? 'Edit Meal' : 'Add Meal'} — {mealType} on {date}
          </DialogTitle>
        </DialogHeader>

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
            <div className="max-h-48 overflow-y-auto space-y-1">
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

        <div className="space-y-3 pt-2">
          <div>
            <Label htmlFor="servings">Servings</Label>
            <Input
              id="servings"
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value) || 1)}
            />
          </div>

          {persons.length > 0 && (
            <div>
              <Label>Assign to</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Leave empty for whole household
              </p>
              <MemberPicker
                persons={persons}
                selected={assignedTo}
                onChange={setAssignedTo}
              />
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingEntry ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
