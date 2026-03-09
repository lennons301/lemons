'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { getAgeCategory } from '@/lib/utils/age-category'
import { getMemberBgClass } from '@/lib/utils/member-colors'

type ManagedMember = {
  id: string
  display_name: string
  avatar_url: string | null
  date_of_birth: string | null
}

export function ManagedMemberForm({
  householdId,
  managedMembers,
  isAdmin,
}: {
  householdId: string
  managedMembers: ManagedMember[]
  isAdmin: boolean
}) {
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDob, setEditDob] = useState('')
  const router = useRouter()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    await fetch(`/api/households/${householdId}/managed-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name.trim(), dateOfBirth: dob || null }),
    })

    setName('')
    setDob('')
    setLoading(false)
    router.refresh()
  }

  function startEdit(member: ManagedMember) {
    setEditingId(member.id)
    setEditName(member.display_name)
    setEditDob(member.date_of_birth || '')
  }

  async function handleSaveEdit(memberId: string) {
    await fetch(`/api/households/${householdId}/managed-members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId,
        displayName: editName.trim(),
        dateOfBirth: editDob || null,
      }),
    })
    setEditingId(null)
    router.refresh()
  }

  async function handleDelete(memberId: string) {
    await fetch(`/api/households/${householdId}/managed-members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managed Members</CardTitle>
        <CardDescription>
          Non-user members like children who don&apos;t have their own account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {managedMembers.length > 0 && (
          <ul className="mb-4 divide-y">
            {managedMembers.map((m) => {
              const ageCategory = getAgeCategory(m.date_of_birth)
              const isEditing = editingId === m.id

              if (isEditing) {
                return (
                  <li key={m.id} className="flex items-center gap-2 py-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      className="flex-1"
                    />
                    <Input
                      type="date"
                      value={editDob}
                      onChange={(e) => setEditDob(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleSaveEdit(m.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                )
              }

              return (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${getMemberBgClass(m.id)}`}
                  >
                    {m.display_name[0].toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-medium">{m.display_name}</span>
                  {ageCategory && (
                    <Badge variant="outline" className="text-xs">
                      {ageCategory}
                    </Badge>
                  )}
                  {m.date_of_birth && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.date_of_birth).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(m)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {isAdmin && (
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="managed-name" className="sr-only">Name</Label>
                <Input
                  id="managed-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                />
              </div>
              <div className="w-40">
                <Label htmlFor="managed-dob" className="sr-only">Date of birth</Label>
                <Input
                  id="managed-dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  placeholder="Date of birth"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
