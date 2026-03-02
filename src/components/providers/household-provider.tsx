'use client'

import { createContext, useContext, useState, useCallback } from 'react'

type Household = {
  id: string
  name: string
  role: string
}

type HouseholdContextType = {
  activeHousehold: Household | null
  households: Household[]
  setActiveHousehold: (household: Household) => void
}

const HouseholdContext = createContext<HouseholdContextType>({
  activeHousehold: null,
  households: [],
  setActiveHousehold: () => {},
})

export function useHousehold() {
  return useContext(HouseholdContext)
}

export function HouseholdProvider({
  children,
  initialHouseholds,
  defaultHouseholdId,
}: {
  children: React.ReactNode
  initialHouseholds: Household[]
  defaultHouseholdId: string | null
}) {
  const [households] = useState(initialHouseholds)
  const [activeHousehold, setActiveHouseholdState] = useState<Household | null>(
    initialHouseholds.find((h) => h.id === defaultHouseholdId) ||
    initialHouseholds[0] || null
  )

  const setActiveHousehold = useCallback(async (household: Household) => {
    setActiveHouseholdState(household)
    // Persist preference to server
    await fetch('/api/profile/default-household', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId: household.id }),
    })
  }, [])

  return (
    <HouseholdContext.Provider value={{ activeHousehold, households, setActiveHousehold }}>
      {children}
    </HouseholdContext.Provider>
  )
}
