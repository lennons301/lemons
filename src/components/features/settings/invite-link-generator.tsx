'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export function InviteLinkGenerator({
  householdId,
}: {
  householdId: string
}) {
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setCopied(false)

    const res = await fetch(`/api/households/${householdId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member' }),
    })

    if (res.ok) {
      const invite = await res.json()
      setInviteLink(`${window.location.origin}/invite/${invite.invite_code}`)
    }

    setLoading(false)
  }

  async function handleCopy() {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Members</CardTitle>
        <CardDescription>
          Generate a link to invite someone to your household.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating...' : 'Generate invite link'}
        </Button>

        {inviteLink && (
          <div className="flex gap-2">
            <Input value={inviteLink} readOnly className="flex-1" />
            <Button variant="outline" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
