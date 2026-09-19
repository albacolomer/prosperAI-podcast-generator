import { Plus } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { suggestedInterests } from "@/data/suggestedInterests"

interface AddInterestDialogProps {
  existingLabels: string[]
  onAdd: (label: string) => void
  trigger?: ReactNode
}

export function AddInterestDialog({ existingLabels, onAdd, trigger }: AddInterestDialogProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  const existingLower = new Set(existingLabels.map((label) => label.toLowerCase()))
  const availableSuggestions = suggestedInterests.filter((s) => !existingLower.has(s.toLowerCase()))

  function handleAdd(label: string) {
    if (!label.trim()) return
    onAdd(label)
    setValue("")
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 rounded-full"
            aria-label="Add interest"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an interest</DialogTitle>
          <DialogDescription>Tell us what you want your podcast to cover.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleAdd(value)
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="interest-input">Interest</Label>
            <Input
              id="interest-input"
              placeholder="e.g. Renewable Energy"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </div>

          {availableSuggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Suggestions</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableSuggestions.map((suggestion) => (
                  <Badge key={suggestion} variant="outline" asChild>
                    <button type="button" onClick={() => handleAdd(suggestion)}>
                      {suggestion}
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={!value.trim()}>
              Add interest
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
