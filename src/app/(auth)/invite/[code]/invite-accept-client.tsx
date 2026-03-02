'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function InviteAcceptClient({
  inviteCode,
  householdName,
}: {
  inviteCode: string
  householdName: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleAccept() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to accept invite')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>You&apos;ve been invited!</CardTitle>
        <CardDescription>
          Join <strong>{householdName}</strong> on Lemons.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button onClick={handleAccept} disabled={loading} className="flex-1">
          {loading ? 'Joining...' : 'Accept invite'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/')} className="flex-1">
          Decline
        </Button>
      </CardFooter>
    </Card>
  )
}
