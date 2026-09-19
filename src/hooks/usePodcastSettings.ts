import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import { DEFAULT_PODCAST_SETTINGS } from "@/types"
import type { PodcastSettings } from "@/types"

export function usePodcastSettings() {
  const [persisted, setPersisted] = useState<PodcastSettings>(() =>
    readStorage<PodcastSettings>(STORAGE_KEYS.settings, DEFAULT_PODCAST_SETTINGS),
  )
  const [draft, setDraft] = useState<PodcastSettings>(persisted)

  const updateDraft = useCallback((partial: Partial<PodcastSettings>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }, [])

  const save = useCallback(() => {
    writeStorage(STORAGE_KEYS.settings, draft)
    setPersisted(draft)
  }, [draft])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(persisted)

  return { settings: draft, updateDraft, save, isDirty }
}
