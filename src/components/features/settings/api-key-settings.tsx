'use client'

import { useEffect, useState } from 'react'
import { Key, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ApiKeySettingsProps {
  householdId: string
}

export function ApiKeySettings({ householdId }: ApiKeySettingsProps) {
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/households/${householdId}/api-key`)
      .then((res) => res.json())
      .then((data) => {
        setHasKey(data.hasKey)
        setMaskedKey(data.masked)
      })
      .catch(() => setError('Failed to load API key status'))
      .finally(() => setLoading(false))
  }, [householdId])

  const handleSave = async () => {
    if (!newKey.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/households/${householdId}/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: newKey.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      const data = await res.json()
      setHasKey(data.hasKey)
      setMaskedKey(data.masked)
      setNewKey('')
      setSuccess('API key saved successfully')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('Remove household API key? Recipe extraction will use the default server key.')) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/households/${householdId}/api-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove')
      }
      setHasKey(false)
      setMaskedKey(null)
      setNewKey('')
      setSuccess('API key removed. Using default server key.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading API key settings...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Key className="h-5 w-5" />
          AI Recipe Extraction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {hasKey
            ? `Using household API key (${maskedKey})`
            : 'Using default server key. Set your own Anthropic API key for this household.'}
        </p>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-500/10 px-3 py-2 text-green-700 text-sm dark:text-green-400">
            {success}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="apiKey">{hasKey ? 'Replace API Key' : 'Anthropic API Key'}</Label>
          <div className="flex gap-2">
            <Input
              id="apiKey"
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <Button onClick={handleSave} disabled={saving || !newKey.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>

        {hasKey && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Remove Key
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
