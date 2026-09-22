import { Button } from "@/components/ui/button"

interface ReadyScreenProps {
  onStartListening: () => void
}

export function ReadyScreen({ onStartListening }: ReadyScreenProps) {
  return (
    <div className="flex w-full flex-col items-center gap-6 py-10 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Your first ProsperPod is ready. 🎧</h1>
        <p className="text-muted-foreground">Made for you. Give it a listen.</p>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={onStartListening}
        className="rounded-full bg-cta-strong px-8 text-cta-strong-foreground hover:bg-cta-strong/90"
      >
        Start listening
      </Button>
    </div>
  )
}
