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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [hint, setHint] = useState('')

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

      // Upload source images if we have them from extraction
      if (sourceFiles.length > 0) {
        const uploadPromises = sourceFiles.map(async (file) => {
          const formData = new FormData()
          formData.append('image', file)
          formData.append('type', 'source')
          return fetch(`/api/recipes/${recipe.id}/images`, {
            method: 'POST',
            body: formData,
          })
        })
        // Fire and forget — don't block navigation for source image uploads
        Promise.all(uploadPromises).catch(console.error)
      }

      router.push(`/recipes/${recipe.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to save recipe')
      setSaving(false)
    }
  }

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length + selectedFiles.length > 5) {
      setError('Maximum 5 images allowed')
      return
    }
    setSelectedFiles((prev) => [...prev, ...files])
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleExtract = async () => {
    if (selectedFiles.length === 0) return
    setExtracting(true)
    setError(null)

    const formData = new FormData()
    const compressed = await Promise.all(selectedFiles.map(compressImage))
    compressed.forEach((file) => formData.append('images', file))
    if (hint.trim()) formData.append('hint', hint.trim())
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

      // Save source files for upload after recipe creation
      setSourceFiles([...selectedFiles])
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
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
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
            <CardTitle className="text-base">Extract from Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Upload photos of a recipe (cookbook pages, screenshots, handwritten cards) and AI will extract the details.
            </p>

            {/* File input */}
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={handleFilesSelected}
              disabled={extracting || selectedFiles.length >= 5}
            />

            {/* Thumbnails */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="group relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-20 w-20 rounded-md border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hint input */}
            {selectedFiles.length > 0 && (
              <div>
                <Label htmlFor="hint">Instructions for AI (optional)</Label>
                <Input
                  id="hint"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder='e.g. "Focus on the recipe at the top of the page"'
                  disabled={extracting}
                />
              </div>
            )}

            {/* Extract button */}
            {selectedFiles.length > 0 && (
              <Button
                type="button"
                onClick={handleExtract}
                disabled={extracting}
              >
                {extracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {extracting ? 'Extracting...' : `Extract from ${selectedFiles.length} ${selectedFiles.length === 1 ? 'image' : 'images'}`}
              </Button>
            )}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

/** Compress an image to fit within Claude's 5MB base64 limit using canvas.
 *  Base64 inflates size ~33%, so raw bytes must stay under ~3.75MB.
 *  Downscales to max 2048px on longest side and iteratively lowers JPEG
 *  quality until the result fits. */
function compressImage(file: File): Promise<File> {
  // 5MB base64 ≈ 3.75MB raw bytes (base64 adds ~33% overhead)
  const MAX_RAW_BYTES = 3.75 * 1024 * 1024
  const MAX_DIM = 2048

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // Iteratively lower quality until we fit under the base64 limit
      const tryQuality = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Canvas compression failed'))
            if (blob.size > MAX_RAW_BYTES && quality > 0.3) {
              return tryQuality(quality - 0.1)
            }
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          },
          'image/jpeg',
          quality
        )
      }
      tryQuality(0.85)
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))
    img.src = URL.createObjectURL(file)
  })
}

function buildRawText(ing: IngredientRow): string {
  const parts: string[] = []
  if (ing.quantity != null) parts.push(ing.quantity.toString())
  if (ing.unit) parts.push(ing.unit)
  if (ing.name) parts.push(ing.name)
  if (ing.notes) parts.push(`, ${ing.notes}`)
  return parts.join(' ') || ''
}
