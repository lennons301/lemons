'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { IngredientInput, type IngredientRow } from '@/components/features/ingredient-input'
import { TagInput } from '@/components/features/tag-input'

interface RecipeFormProps {
  householdId: string
  initialData?: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    instructions: string[]
    source_url: string | null
    recipe_ingredients: IngredientRow[]
    recipe_tags: { tag_name: string }[]
  }
}

export function RecipeForm({ householdId, initialData }: RecipeFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const [title, setTitle] = useState(initialData?.title || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [servings, setServings] = useState(initialData?.servings || 4)
  const [prepTime, setPrepTime] = useState(initialData?.prep_time?.toString() || '')
  const [cookTime, setCookTime] = useState(initialData?.cook_time?.toString() || '')
  const [sourceUrl, setSourceUrl] = useState(initialData?.source_url || '')
  const [instructions, setInstructions] = useState<string[]>(
    initialData?.instructions?.length ? initialData.instructions : ['']
  )
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initialData?.recipe_ingredients || []
  )
  const [tags, setTags] = useState<string[]>(
    initialData?.recipe_tags?.map((t) => t.tag_name) || []
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Recipe title is required')
      return
    }
    setSaving(true)
    setError(null)

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      servings,
      prep_time: prepTime ? parseInt(prepTime) : null,
      cook_time: cookTime ? parseInt(cookTime) : null,
      instructions: instructions.filter((s) => s.trim()),
      source_url: sourceUrl.trim() || null,
      household_id: householdId,
      ingredients: ingredients.map((ing, idx) => ({
        ...ing,
        raw_text: ing.raw_text || buildRawText(ing),
        sort_order: idx,
      })),
      tags,
    }

    const url = isEditing ? `/api/recipes/${initialData.id}` : '/api/recipes'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const recipe = await res.json()
      router.push(`/recipes/${recipe.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to save recipe')
      setSaving(false)
    }
  }

  const handleImageExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    setError(null)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('householdId', householdId)

    try {
      const res = await fetch('/api/recipes/extract', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Extraction failed')
      }
      const result = await res.json()

      // Pre-populate form with extracted data
      setTitle(result.title || title)
      setDescription(result.description || description)
      if (result.servings) setServings(result.servings)
      if (result.prep_time) setPrepTime(result.prep_time.toString())
      if (result.cook_time) setCookTime(result.cook_time.toString())
      if (result.instructions?.length) setInstructions(result.instructions)
      if (result.ingredients?.length) {
        setIngredients(
          result.ingredients.map((ing: any) => ({
            raw_text: ing.raw_text || '',
            quantity: ing.quantity,
            unit: ing.unit,
            name: ing.name,
            group: ing.group || null,
            optional: false,
            notes: ing.notes,
          }))
        )
      }
      if (result.tags?.length) setTags(result.tags)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  const updateInstruction = (idx: number, value: string) => {
    const updated = [...instructions]
    updated[idx] = value
    setInstructions(updated)
  }

  const addInstruction = () => setInstructions([...instructions, ''])

  const removeInstruction = (idx: number) => {
    if (instructions.length === 1) return
    setInstructions(instructions.filter((_, i) => i !== idx))
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Link href={isEditing ? `/recipes/${initialData.id}` : '/recipes'}>
          <Button variant="ghost" size="sm" type="button">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="flex-1 text-2xl font-bold">
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>
      </div>

      {/* AI Extraction */}
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extract from Image</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Upload a photo of a recipe (cookbook page, screenshot, handwritten) and AI will extract the details.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageExtract}
                disabled={extracting}
              />
              {extracting && (
                <span className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting...
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chicken Tikka Masala"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the dish"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="servings">Servings</Label>
              <Input
                id="servings"
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(parseInt(e.target.value) || 4)}
              />
            </div>
            <div>
              <Label htmlFor="prep">Prep (min)</Label>
              <Input
                id="prep"
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
              />
            </div>
            <div>
              <Label htmlFor="cook">Cook (min)</Label>
              <Input
                id="cook"
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="source">Source URL</Label>
            <Input
              id="source"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingredients</CardTitle>
        </CardHeader>
        <CardContent>
          <IngredientInput ingredients={ingredients} onChange={setIngredients} />
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {instructions.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-muted-foreground mt-2.5 w-6 shrink-0 text-right text-sm">
                {idx + 1}.
              </span>
              <Input
                value={step}
                onChange={(e) => updateInstruction(idx, e.target.value)}
                placeholder={`Step ${idx + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => removeInstruction(idx)}
                type="button"
                disabled={instructions.length === 1}
              >
                &times;
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
            Add Step
          </Button>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput tags={tags} onChange={setTags} />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-2">
        <Link href={isEditing ? `/recipes/${initialData.id}` : '/recipes'}>
          <Button variant="outline" type="button">Cancel</Button>
        </Link>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Recipe'}
        </Button>
      </div>
    </form>
  )
}

function buildRawText(ing: IngredientRow): string {
  const parts: string[] = []
  if (ing.quantity != null) parts.push(ing.quantity.toString())
  if (ing.unit) parts.push(ing.unit)
  if (ing.name) parts.push(ing.name)
  if (ing.notes) parts.push(`, ${ing.notes}`)
  return parts.join(' ') || ''
}
