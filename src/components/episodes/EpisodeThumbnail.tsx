import { Radio } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EpisodeThumbnailProps {
  gradient: string
  className?: string
  children?: ReactNode
}

export function EpisodeThumbnail({ gradient, className, children }: EpisodeThumbnailProps) {
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl", className)}
      style={{ backgroundImage: gradient }}
    >
      <Radio className="size-8 text-white/30" strokeWidth={1.5} />
      {children}
    </div>
  )
}
