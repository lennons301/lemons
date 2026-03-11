'use client'

import Link from 'next/link'

interface DashboardWidgetProps {
  title: string
  linkHref: string
  linkText: string
  empty?: string // empty state message
  children?: React.ReactNode
}

export function DashboardWidget({ title, linkHref, linkText, empty, children }: DashboardWidgetProps) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex justify-between items-center mb-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={linkHref} className="text-[11px] text-primary hover:underline">
          {linkText}
        </Link>
      </div>
      {children || (
        <p className="text-xs text-muted-foreground py-4 text-center">{empty || 'Nothing here'}</p>
      )}
    </div>
  )
}
