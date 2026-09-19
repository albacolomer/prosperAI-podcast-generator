import { ThumbsDown, ThumbsUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { EpisodeFeedback } from "@/types"

interface FeedbackButtonsProps {
  value: EpisodeFeedback | undefined
  onChange: (value: EpisodeFeedback) => void
  className?: string
}

export function FeedbackButtons({ value, onChange, className }: FeedbackButtonsProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={cn("size-9 rounded-full", value === "up" && "bg-status-good/15 text-status-good")}
        onClick={() => onChange("up")}
        aria-pressed={value === "up"}
        aria-label="Good episode"
      >
        <ThumbsUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={cn("size-9 rounded-full", value === "down" && "bg-status-bad/15 text-status-bad")}
        onClick={() => onChange("down")}
        aria-pressed={value === "down"}
        aria-label="Not for me"
      >
        <ThumbsDown className="size-4" />
      </Button>
    </div>
  )
}
