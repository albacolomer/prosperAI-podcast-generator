import { Check, Circle, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { EpisodeGenerationState } from "@/hooks/useEpisodeGeneration"
import { stepStatuses } from "@/lib/episodeProgress"
import { cn } from "@/lib/utils"

interface GenerationStatusCardProps {
  state: EpisodeGenerationState
  onDismissError: () => void
}

/** Shows what the server has actually finished so far, or why the episode could not be made. Nothing here is estimated. */
export function GenerationStatusCard({ state, onDismissError }: GenerationStatusCardProps) {
  if (state.status === "idle") return null

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't create your episode</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{state.message}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onDismissError}>
            Dismiss
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="gap-3 p-5" role="status" aria-live="polite">
      <div>
        <h2 className="font-semibold text-foreground">Generating your episode…</h2>
        <p className="text-sm text-muted-foreground">This may take a few minutes.</p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {stepStatuses(state.progress).map(({ label, status }) => (
          <li
            key={label}
            data-status={status}
            className={cn("flex items-center gap-2", status === "pending" ? "text-muted-foreground" : "text-foreground")}
          >
            {status === "done" ? (
              <Check className="size-4 text-primary" />
            ) : status === "active" ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <Circle className="size-4 text-muted-foreground/50" />
            )}
            {label}
          </li>
        ))}
      </ul>
    </Card>
  )
}
