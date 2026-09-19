import { cn } from "@/lib/utils"

const bars = [
  { delay: "0ms", height: "40%" },
  { delay: "150ms", height: "100%" },
  { delay: "300ms", height: "65%" },
]

export function PlayingIndicator({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-3 items-end gap-0.5", className)} aria-hidden="true">
      {bars.map((bar) => (
        <span
          key={bar.delay}
          className="w-0.5 origin-bottom animate-equalizer rounded-full bg-current"
          style={{ height: bar.height, animationDelay: bar.delay }}
        />
      ))}
    </span>
  )
}
