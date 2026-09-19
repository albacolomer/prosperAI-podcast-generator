import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface InterestChipProps {
  label: string
  selected: boolean
  onToggleSelect: () => void
  onRemove: () => void
}

export function InterestChip({ label, selected, onToggleSelect, onRemove }: InterestChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full pr-1.5 pl-1 text-sm font-medium ring-1 transition-colors",
        selected
          ? "bg-primary/10 text-primary ring-primary/30"
          : "bg-secondary text-muted-foreground ring-transparent hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={selected}
        className="rounded-full px-2 py-1"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors",
          selected ? "hover:bg-primary/20" : "hover:bg-foreground/10 hover:text-foreground",
        )}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}
