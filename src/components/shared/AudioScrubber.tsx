import { useEffect, useRef, useState } from "react"
import { EpisodeAudioElement } from "@/components/shared/EpisodeAudioElement"
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
  /** The episode's real audio. Without it the scrubber only simulates playback (the demo episodes). */
  audioUrl?: string
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function AudioScrubber({ episodeId, durationSeconds, playing, onTogglePlay, label, audioUrl }: AudioScrubberProps) {
  const [elapsed, setElapsed] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(0)
  // The decoded length replaces the estimate once the browser has read the MP3.
  const [decodedSeconds, setDecodedSeconds] = useState<number | null>(null)
  const previousEpisodeId = useRef(episodeId)
  const total = decodedSeconds ?? durationSeconds

  useEffect(() => {
    if (previousEpisodeId.current !== episodeId) {
      previousEpisodeId.current = episodeId
      setElapsed(0)
      setDecodedSeconds(null)
    }
  }, [episodeId])

  useEffect(() => {
    if (!playing || audioUrl) return
    const speed = SPEEDS[speedIndex]
    const interval = setInterval(() => {
      setElapsed((prev) => Math.min(durationSeconds, prev + speed))
    }, 1000)
    return () => clearInterval(interval)
  }, [playing, durationSeconds, speedIndex, audioUrl])

  const progress = total > 0 ? (elapsed / total) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      {audioUrl ? (
        <EpisodeAudioElement
          src={audioUrl}
          playing={playing}
          playbackRate={SPEEDS[speedIndex]}
          onTimeUpdate={setElapsed}
          onDuration={setDecodedSeconds}
          onStop={onTogglePlay}
        />
      ) : null}
      <PlayButton playing={playing} onClick={onTogglePlay} label={label} className="size-11 shrink-0" />
      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(elapsed)}</span>
      <Progress value={progress} className="h-1.5" />
      <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums">{formatTime(total)}</span>
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
