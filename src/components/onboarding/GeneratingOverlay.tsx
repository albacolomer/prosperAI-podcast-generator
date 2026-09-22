import { AudioLines, Check, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

const CHECKLIST = ["Your interests", "Your listening preferences", "Today's stories", "Creating your episode"]

/** Roughly 5 seconds total, ticking one checklist item off at a time. */
const STEP_DELAYS_MS = [900, 1000, 1200, 1900]

interface GeneratingOverlayProps {
  onComplete: () => void
}

export function GeneratingOverlay({ onComplete }: GeneratingOverlayProps) {
  const [completedCount, setCompletedCount] = useState(0)

  useEffect(() => {
    const timers = STEP_DELAYS_MS.map((_delay, index) => {
      const at = STEP_DELAYS_MS.slice(0, index + 1).reduce((sum, value) => sum + value, 0)
      return setTimeout(() => setCompletedCount(index + 1), at)
    })
    const totalMs = STEP_DELAYS_MS.reduce((sum, value) => sum + value, 0)
    const finalTimer = setTimeout(onComplete, totalMs + 500)
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(finalTimer)
    }
  }, [onComplete])

  return (
    <div className="flex w-full flex-col items-center gap-8 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <AudioLines className="size-7 animate-pulse text-primary" strokeWidth={2.5} />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Creating your first ProsperPod…</h1>
        <p className="text-muted-foreground">We're turning your interests into something worth listening to.</p>
      </div>

      <ul className="flex w-full max-w-xs flex-col gap-3 text-left">
        {CHECKLIST.map((label, index) => {
          const isDone = index < completedCount
          const isActive = index === completedCount
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3" /> : isActive ? <Loader2 className="size-3 animate-spin" /> : null}
              </span>
              <span className={cn("text-sm", isDone || isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
