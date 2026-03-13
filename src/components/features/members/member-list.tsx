'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getMemberColor } from '@/lib/utils/member-colors'

type Member = {
  id: string
  household_id: string
  profile_id: string
  role: string
  display_name: string | null
  joined_at: string
  invited_by: string | null
  profiles: { display_name: string | null; email: string } | null
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

const memberColorStyles: Record<string, { bg: string; text: string }> = {
  azure: { bg: 'bg-member-azure', text: 'text-white' },
  coral: { bg: 'bg-member-coral', text: 'text-white' },
  lemon: { bg: 'bg-member-lemon', text: 'text-amber-950' },
  sage: { bg: 'bg-member-sage', text: 'text-white' },
  bougainvillea: { bg: 'bg-member-bougainvillea', text: 'text-white' },
  lavender: { bg: 'bg-member-lavender', text: 'text-white' },
  tangerine: { bg: 'bg-member-tangerine', text: 'text-amber-950' },
  teal: { bg: 'bg-member-teal', text: 'text-white' },
}

export function MemberList({
  members,
  isAdmin,
}: {
  members: Member[]
  isAdmin: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {members.map((member) => {
            const profile = member.profiles as { display_name: string | null; email: string } | null
            const displayName = profile?.display_name ?? profile?.email ?? 'Unknown'
            const color = getMemberColor(member.profile_id)
            const styles = memberColorStyles[color]

            return (
              <li key={member.id} className="flex items-center gap-3 py-3">
                <Avatar size="sm">
                  <AvatarFallback className={`${styles.bg} ${styles.text} text-xs font-semibold`}>
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {displayName}
                  </p>
                  {profile?.display_name && (
                    <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                  )}
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                  {member.role}
                </span>
              </li>
            )
          })}
        </ul>
        {!isAdmin && (
          <p className="mt-3 text-xs text-muted-foreground">Only admins can manage members.</p>
        )}
      </CardContent>
    </Card>
  )
}
