import { useCallback, useEffect, useRef, useState } from "react"
import { STORAGE_KEYS } from "@/lib/constants"
import { normalizeSettings } from "@/lib/settingsMigration"
import { readStorage, writeStorage } from "@/lib/storage"
import type { PodcastSettings } from "@/types"

/** The schedule fields the server owns: what it holds wins over what this browser remembers. */
export type ScheduleFields = Pick<PodcastSettings, "scheduleEnabled" | "frequency" | "weekday" | "dayOfMonth" | "deliveryTime">

function loadSettings(): PodcastSettings {
  return normalizeSettings(readStorage<unknown>(STORAGE_KEYS.settings, {}))
}

export function usePodcastSettings() {
  const [persisted, setPersisted] = useState<PodcastSettings>(loadSettings)
  const [draft, setDraft] = useState<PodcastSettings>(persisted)
  const persistedRef = useRef(persisted)
  useEffect(() => {
    persistedRef.current = persisted
  })

  const updateDraft = useCallback((partial: Partial<PodcastSettings>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
  }, [])

  const save = useCallback(() => {
    writeStorage(STORAGE_KEYS.settings, draft)
    setPersisted(draft)
  }, [draft])

  /**
   * Takes the schedule the server holds, for a browser that has none of it (site data cleared, another browser). Fields the
   * user has already edited in the draft are left alone; the saved copy always follows the server.
   */
  const adoptSchedule = useCallback((fields: ScheduleFields) => {
    const previous = persistedRef.current
    const next = { ...previous, ...fields }
    if (JSON.stringify(next) === JSON.stringify(previous)) return
    writeStorage(STORAGE_KEYS.settings, next)
    setPersisted(next)
    setDraft((current) => {
      const merged = { ...current }
      for (const key of Object.keys(fields) as (keyof ScheduleFields)[]) {
        if (current[key] === previous[key]) Object.assign(merged, { [key]: fields[key] })
      }
      return merged
    })
  }, [])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(persisted)

  return { settings: draft, updateDraft, save, isDirty, adoptSchedule }
}
