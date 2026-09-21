import { Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { EpisodeGenerationState } from "@/hooks/useEpisodeGeneration"

interface GenerationStatusCardProps {
  state: EpisodeGenerationState
  onDismissError: () => void
}

/** One calm message while a podcast is being made, or why it could not be. The stages of the pipeline stay in the server's logs. */
export function GenerationStatusCard({ state, onDismissError }: GenerationStatusCardProps) {
  if (state.status === "idle") return null

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>We couldn't create your podcast</AlertTitle>
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
    <Card className="flex-row items-center gap-3 p-5" role="status" aria-live="polite">
      <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
      <p className="font-medium text-foreground">Generating your new podcast, this may take a few minutes.</p>
    </Card>
  )
}
