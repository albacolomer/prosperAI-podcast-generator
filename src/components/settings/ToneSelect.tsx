import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { tones } from "@/data/tones"
import type { Tone } from "@/types"

interface ToneSelectProps {
  value: Tone
  onChange: (tone: Tone) => void
  disabled?: boolean
}

export function ToneSelect({ value, onChange, disabled }: ToneSelectProps) {
  const selected = tones.find((tone) => tone.id === value)

  return (
    <div className="flex flex-col gap-1.5">
      <Select value={value} onValueChange={(next) => onChange(next as Tone)} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a tone" />
        </SelectTrigger>
        <SelectContent>
          {tones.map((tone) => (
            <SelectItem key={tone.id} value={tone.id}>
              {tone.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? <p className="text-xs text-muted-foreground">{selected.description}</p> : null}
    </div>
  )
}
