'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type ManagedMember = {
  id: string
  display_name: string
  avatar_url: string | null
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
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    await fetch(`/api/households/${householdId}/managed-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name.trim() }),
    })

    setName('')
    setLoading(false)
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
            {managedMembers.map((m) => (
              <li key={m.id} className="py-2 text-sm">
                {m.display_name}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
