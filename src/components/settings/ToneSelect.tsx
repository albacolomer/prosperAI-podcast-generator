import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { tones } from "@/data/tones"
import type { Tone } from "@/types"

interface ToneSelectProps {
  value: Tone
  onChange: (tone: Tone) => void
  disabled?: boolean
}

/** Closed, it shows only the chosen tone. Open, each tone comes with its description, to help choose. */
export function ToneSelect({ value, onChange, disabled }: ToneSelectProps) {
  const selected = tones.find((tone) => tone.id === value)

  return (
    <Select value={value} onValueChange={(next) => onChange(next as Tone)} disabled={disabled}>
      <SelectTrigger className="w-full">
        {/* Given explicitly, or the trigger would repeat the whole option, description included. */}
        <SelectValue placeholder="Select a tone">{selected?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-80">
        {tones.map((tone) => (
          <SelectItem key={tone.id} value={tone.id} className="items-start py-1.5">
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{tone.label}</span>
              <span className="text-xs font-normal whitespace-normal text-muted-foreground">{tone.description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
