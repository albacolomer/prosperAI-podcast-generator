import { Check, ChevronDown } from "lucide-react"
import { useState } from "react"
import { PlayButton } from "@/components/shared/PlayButton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { mockVoices } from "@/data/mockVoices"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import { cn } from "@/lib/utils"

interface VoiceQuickSelectProps {
  value: string
  onChange: (voiceId: string) => void
  disabled?: boolean
}

export function VoiceQuickSelect({ value, onChange, disabled }: VoiceQuickSelectProps) {
  const [open, setOpen] = useState(false)
  const player = useMockPlayer()
  const selectedVoice = mockVoices.find((voice) => voice.id === value) ?? mockVoices[0]

  return (
    <div className="flex items-center gap-2 rounded-lg border border-input bg-background py-1.5 pr-1.5 pl-2">
      <PlayButton
        playing={player.isPlaying(selectedVoice.id)}
        onClick={() => player.toggle(selectedVoice.id, selectedVoice.previewSeconds * 1000)}
        label={`${selectedVoice.name} preview`}
        disabled={disabled}
        className="size-8"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{selectedVoice.name}</p>
        <p className="truncate text-xs text-muted-foreground">{selectedVoice.descriptor}</p>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            aria-label="Choose a different voice"
          >
            <ChevronDown className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-1.5" align="end">
          <div className="flex flex-col">
            {mockVoices.map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => {
                  onChange(voice.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                  voice.id === value && "bg-primary/10",
                )}
              >
                <span className="flex-1">
                  <span className="block font-medium text-foreground">{voice.name}</span>
                  <span className="block text-xs text-muted-foreground">{voice.descriptor}</span>
                </span>
                {voice.id === value ? <Check className="size-4 text-primary" /> : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
