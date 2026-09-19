import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
      const period = hour < 12 ? "AM" : "PM"
      const displayHour = hour % 12 === 0 ? 12 : hour % 12
      const label = `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`
      options.push({ value, label })
    }
  }
  return options
}

const timeOptions = generateTimeOptions()

interface DeliveryTimePickerProps {
  value: string
  onChange: (time: string) => void
  disabled?: boolean
}

export function DeliveryTimePicker({ value, onChange, disabled }: DeliveryTimePickerProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label="Delivery time">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {timeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
