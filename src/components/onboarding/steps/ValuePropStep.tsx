import { AudioLines } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ValuePropStepProps {
  onNext: () => void
}

export function ValuePropStep({ onNext }: ValuePropStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <AudioLines className="size-7 text-primary" strokeWidth={2.5} />
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Your daily podcast, made for you.
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          ProsperPod turns the stories you care about into a podcast you'll actually want to listen to.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={onNext}
        className="rounded-full bg-cta-strong px-8 text-cta-strong-foreground hover:bg-cta-strong/90"
      >
        Get started
      </Button>
    </div>
  )
}
