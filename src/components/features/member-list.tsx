'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
            return (
              <li key={member.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">
                    {profile?.display_name ?? profile?.email ?? 'Unknown'}
                  </p>
                  {profile?.display_name && (
                    <p className="text-xs text-gray-500">{profile.email}</p>
                  )}
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                  {member.role}
                </span>
              </li>
            )
          })}
        </ul>
        {!isAdmin && (
          <p className="mt-3 text-xs text-gray-500">Only admins can manage members.</p>
        )}
      </CardContent>
    </Card>
  )
}
