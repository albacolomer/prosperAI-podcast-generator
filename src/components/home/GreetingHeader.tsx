import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { mockCurrentUser } from "@/data/mockUser"

interface GreetingHeaderProps {
  onGenerate: () => void
  generating: boolean
  gated: boolean
}

function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 5) return { text: "Good night", emoji: "🌙" }
  if (hour < 12) return { text: "Good morning", emoji: "☀️" }
  if (hour < 18) return { text: "Good afternoon", emoji: "⛅" }
  return { text: "Good evening", emoji: "🌆" }
}

export function GreetingHeader({ onGenerate, generating, gated }: GreetingHeaderProps) {
  const { text, emoji } = getGreeting()
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })

  const generateButton = (
    <Button
      type="button"
      onClick={onGenerate}
      disabled={generating || gated}
      className="shrink-0 rounded-full bg-cta-strong text-cta-strong-foreground hover:bg-cta-strong/90"
    >
      {generating ? <Loader2 className="animate-spin" /> : <Plus />}
      {generating ? "Generating…" : "Generate new episode"}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {text}, {mockCurrentUser.name}
          <span aria-hidden="true">{emoji}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          Here's your latest episode, freshly generated from the topics you care about.
        </p>
      </div>

      {gated ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">{generateButton}</span>
          </TooltipTrigger>
          <TooltipContent>Add at least one interest first</TooltipContent>
        </Tooltip>
      ) : (
        generateButton
      )}
    </div>
  )
}
