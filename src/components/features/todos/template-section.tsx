'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TodoListWithCounts } from '@/types/todos'

interface TemplateSectionProps {
  householdId: string
  onUseTemplate: (templateId: string) => void
}

export function TemplateSection({ householdId, onUseTemplate }: TemplateSectionProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TodoListWithCounts[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/todos?householdId=${householdId}&templates=true`)
      .then((res) => res.json())
      .then((data) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [householdId])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } else {
      toast.error('Failed to delete template')
    }
  }

  const handleUseTemplate = async (templateId: string) => {
    const res = await fetch(`/api/todos/${templateId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: false }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/todos/${created.id}`)
      router.refresh()
    } else {
      toast.error('Failed to create from template')
    }
  }

  if (loading || templates.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Templates
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="border rounded-lg p-3"
            style={{ borderLeftWidth: t.color ? 4 : 1, borderLeftColor: t.color ?? undefined }}
          >
            <div className="flex justify-between items-start">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t.total_items} item{t.total_items !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleUseTemplate(t.id)}
                  title="Use template"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDelete(t.id)}
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
