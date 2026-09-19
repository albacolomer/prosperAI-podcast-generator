import { useCallback, useState } from "react"
import { STORAGE_KEYS } from "@/lib/constants"
import { readStorage, writeStorage } from "@/lib/storage"
import type { EpisodeFeedback } from "@/types"

type FeedbackMap = Record<string, EpisodeFeedback>

export function useEpisodeFeedback() {
  const [feedback, setFeedback] = useState<FeedbackMap>(() =>
    readStorage<FeedbackMap>(STORAGE_KEYS.episodeFeedback, {}),
  )

  const setEpisodeFeedback = useCallback((episodeId: string, value: EpisodeFeedback) => {
    setFeedback((prev) => {
      const next = { ...prev }
      if (next[episodeId] === value) {
        delete next[episodeId]
      } else {
        next[episodeId] = value
      }
      writeStorage(STORAGE_KEYS.episodeFeedback, next)
      return next
    })
  }, [])

  return { feedback, setEpisodeFeedback }
}
