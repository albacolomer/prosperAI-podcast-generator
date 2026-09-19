import { useCallback, useEffect, useRef, useState } from "react"

export function useMockPlayer(defaultAutoStopMs?: number) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPlayingId(null)
  }, [])

  const play = useCallback(
    (id: string, autoStopMs?: number) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setPlayingId(id)
      const stopAfter = autoStopMs ?? defaultAutoStopMs
      if (stopAfter) {
        timeoutRef.current = setTimeout(() => {
          setPlayingId(null)
          timeoutRef.current = null
        }, stopAfter)
      }
    },
    [defaultAutoStopMs],
  )

  const toggle = useCallback(
    (id: string, autoStopMs?: number) => {
      if (playingId === id) {
        stop()
      } else {
        play(id, autoStopMs)
      }
    },
    [playingId, play, stop],
  )

  const isPlaying = useCallback((id: string) => playingId === id, [playingId])

  return { playingId, isPlaying, play, stop, toggle }
}
