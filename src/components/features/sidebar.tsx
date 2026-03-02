'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ChefHat,
  Package,
  ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HouseholdSwitcher } from './household-switcher'
import { UserMenu } from './user-menu'

const navItems = [
  { href: '/recipes', label: 'Recipes', icon: BookOpen },
  { href: '/meal-plans', label: 'Meal Plans', icon: ChefHat },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/todos', label: 'Todos', icon: CheckSquare },
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/shopping', label: 'Shopping', icon: ShoppingCart },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-white">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-xl font-bold">
          Lemons
        </Link>
      </div>

      <div className="px-3 py-3">
        <HouseholdSwitcher />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-3">
        <UserMenu />
      </div>
    </aside>
  )
}
