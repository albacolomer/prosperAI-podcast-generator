import { Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PlayButtonProps {
  playing: boolean
  onClick: () => void
  label: string
  disabled?: boolean
  className?: string
}

export function PlayButton({ playing, onClick, label, disabled, className }: PlayButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant={playing ? "default" : "secondary"}
      className={cn("size-9 rounded-full", className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={playing}
    >
      {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
    </Button>
  )
}
