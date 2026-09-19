import { useCallback, useState } from "react"
import { seedInterests } from "@/data/seedInterests"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import type { Interest } from "@/types"

function createInterest(label: string): Interest {
  return {
    id: `interest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: new Date().toISOString(),
    selected: true,
  }
}

export function useInterests() {
  const [interests, setInterests] = useState<Interest[]>(() =>
    readStorage<Interest[]>(STORAGE_KEYS.interests, seedInterests),
  )

  const addInterest = useCallback((label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    setInterests((prev) => {
      const alreadyExists = prev.some((interest) => interest.label.toLowerCase() === trimmed.toLowerCase())
      if (alreadyExists) return prev
      const next = [...prev, createInterest(trimmed)]
      writeStorage(STORAGE_KEYS.interests, next)
      return next
    })
  }, [])

  const removeInterest = useCallback((id: string) => {
    setInterests((prev) => {
      const next = prev.filter((interest) => interest.id !== id)
      writeStorage(STORAGE_KEYS.interests, next)
      return next
    })
  }, [])

  const toggleInterestSelected = useCallback((id: string) => {
    setInterests((prev) => {
      const next = prev.map((interest) =>
        interest.id === id ? { ...interest, selected: !interest.selected } : interest,
      )
      writeStorage(STORAGE_KEYS.interests, next)
      return next
    })
  }, [])

  return { interests, addInterest, removeInterest, toggleInterestSelected }
}
