import { useEffect, useRef } from "react"

interface EpisodeAudioElementProps {
  src: string
  /** The player's play/pause state; this element follows it. */
  playing: boolean
  playbackRate?: number
  onTimeUpdate?: (seconds: number) => void
  /** The decoded length of the MP3, once the browser knows it. */
  onDuration?: (seconds: number) => void
  /** Playback finished, or could not start or continue: the player should show itself as paused. */
  onStop: () => void
}

/** The real audio behind a generated episode's play button. Renders no UI of its own. */
export function EpisodeAudioElement({ src, playing, playbackRate = 1, onTimeUpdate, onDuration, onStop }: EpisodeAudioElementProps) {
  const ref = useRef<HTMLAudioElement>(null)
  const onStopRef = useRef(onStop)
  const playingRef = useRef(playing)
  // Declared first so the play/pause effect below and the audio events always see the latest values.
  useEffect(() => {
    onStopRef.current = onStop
    playingRef.current = playing
  })
  // Only a play that was asked for can end: a preload error while paused must not flip the button.
  const stop = () => {
    if (playingRef.current) onStopRef.current()
  }

  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    if (playing) {
      audio.play().catch(stop)
    } else {
      audio.pause()
    }
  }, [playing, src])

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = playbackRate
  }, [playbackRate, src])

  return (
    <audio
      ref={ref}
      src={src}
      preload="metadata"
      className="hidden"
      onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => {
        const { duration } = event.currentTarget
        if (Number.isFinite(duration) && duration > 0) onDuration?.(duration)
      }}
      onEnded={stop}
      onError={stop}
    />
  )
}
