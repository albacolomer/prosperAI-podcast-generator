import { useEffect, useRef, useState } from "react"
import { PlayButton } from "@/components/shared/PlayButton"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

const SPEEDS = [1, 1.25, 1.5, 2]

interface AudioScrubberProps {
  episodeId: string
  durationSeconds: number
  playing: boolean
  onTogglePlay: () => void
  label: string
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function AudioScrubber({ episodeId, durationSeconds, playing, onTogglePlay, label }: AudioScrubberProps) {
  const [elapsed, setElapsed] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(0)
  const previousEpisodeId = useRef(episodeId)

  useEffect(() => {
    if (previousEpisodeId.current !== episodeId) {
      previousEpisodeId.current = episodeId
      setElapsed(0)
    }
  }, [episodeId])

  useEffect(() => {
    if (!playing) return
    const speed = SPEEDS[speedIndex]
    const interval = setInterval(() => {
      setElapsed((prev) => Math.min(durationSeconds, prev + speed))
    }, 1000)
    return () => clearInterval(interval)
  }, [playing, durationSeconds, speedIndex])

  const progress = durationSeconds > 0 ? (elapsed / durationSeconds) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      <PlayButton playing={playing} onClick={onTogglePlay} label={label} className="size-11 shrink-0" />
      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(elapsed)}</span>
      <Progress value={progress} className="h-1.5" />
      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(durationSeconds)}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0 rounded-full px-2.5 text-xs"
        onClick={() => setSpeedIndex((prev) => (prev + 1) % SPEEDS.length)}
      >
        {SPEEDS[speedIndex]}x
      </Button>
    </div>
  )
}
