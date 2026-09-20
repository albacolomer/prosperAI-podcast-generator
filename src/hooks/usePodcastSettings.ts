import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import { DEFAULT_PODCAST_SETTINGS, EPISODE_DURATION_MINUTES } from "@/types"
import type { PodcastSettings } from "@/types"

/** Settings saved by an older version may lack newer fields or hold a duration that used to be editable. */
function loadSettings(): PodcastSettings {
  // The voice used to be a setting; it is server configuration now, so a saved one is dropped.
  const { voiceId: _voice, ...stored } = readStorage<Partial<PodcastSettings> & { voiceId?: string }>(STORAGE_KEYS.settings, {})
  // The duration used to be editable; it is fixed now, so whatever was saved is replaced.
  return { ...DEFAULT_PODCAST_SETTINGS, ...stored, durationMinutes: EPISODE_DURATION_MINUTES }
}

export function usePodcastSettings() {
  const [persisted, setPersisted] = useState<PodcastSettings>(loadSettings)
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
