import { Plus } from "lucide-react"
import { AddInterestDialog } from "@/components/interests/AddInterestDialog"
import { InterestChip } from "@/components/interests/InterestChip"
import type { Interest } from "@/types"

interface InterestsSidebarCardProps {
  interests: Interest[]
  onAdd: (label: string) => void
  onRemove: (id: string) => void
  onToggleSelect: (id: string) => void
}

export function InterestsSidebarCard({ interests, onAdd, onRemove, onToggleSelect }: InterestsSidebarCardProps) {
  return (
    <div className="rounded-2xl border border-panel-tint-border bg-panel-tint p-5">
      <div className="mb-1">
        <h2 className="font-semibold text-foreground">Your interests</h2>
        <p className="text-xs text-muted-foreground">Tap to include or leave out of your podcast.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {interests.map((interest) => (
          <InterestChip
            key={interest.id}
            label={interest.label}
            selected={interest.selected}
            onToggleSelect={() => onToggleSelect(interest.id)}
            onRemove={() => onRemove(interest.id)}
          />
        ))}
        <AddInterestDialog
          existingLabels={interests.map((interest) => interest.label)}
          onAdd={onAdd}
          trigger={
            <button
              type="button"
              className="flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              Add
            </button>
          }
        />
      </div>
    </div>
  )
}
