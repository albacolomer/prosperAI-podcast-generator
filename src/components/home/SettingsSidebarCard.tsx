import { Calendar, ChevronUp, Clock, Globe, MessageSquareText, Settings2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { CustomScheduleFields } from "@/components/settings/CustomScheduleFields"
import { DeliveryTimePicker } from "@/components/settings/DeliveryTimePicker"
import { DurationSlider } from "@/components/settings/DurationSlider"
import { LanguageSelect } from "@/components/settings/LanguageSelect"
import { ScheduleFrequencySelect } from "@/components/settings/ScheduleFrequencySelect"
import { ToneSelect } from "@/components/settings/ToneSelect"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { DayOfWeek, PodcastSettings } from "@/types"

interface SettingsSidebarCardProps {
  hasInterests: boolean
  settings: PodcastSettings
  updateDraft: (partial: Partial<PodcastSettings>) => void
  isDirty: boolean
  onSave: () => void
}

interface SettingRowProps {
  icon: ReactNode
  label: string
  children: ReactNode
}

function SettingRow({ icon, label, children }: SettingRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

export function SettingsSidebarCard({ hasInterests, settings, updateDraft, isDirty, onSave }: SettingsSidebarCardProps) {
  const [expanded, setExpanded] = useState(true)
  const gated = !hasInterests

  const saveButton = (
    <Button type="button" onClick={onSave} disabled={gated || !isDirty} className="w-full rounded-full">
      Save changes
    </Button>
  )

  return (
    <div className="rounded-2xl border border-panel-tint-border bg-panel-tint p-5">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <Settings2 className="size-4" />
          Project settings
        </span>
        <ChevronUp className={cn("size-4 text-muted-foreground transition-transform", !expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <div className="mt-4 flex flex-col gap-4">
          <SettingRow icon={<Globe className="size-4 text-muted-foreground" />} label="Language">
            <LanguageSelect
              value={settings.language}
              onChange={(language) => updateDraft({ language })}
              disabled={gated}
            />
          </SettingRow>

          <SettingRow icon={<Clock className="size-4 text-muted-foreground" />} label="Duration">
            <DurationSlider
              value={settings.durationMinutes}
              onChange={(durationMinutes) => updateDraft({ durationMinutes })}
              disabled={gated}
            />
          </SettingRow>

          <SettingRow icon={<MessageSquareText className="size-4 text-muted-foreground" />} label="Tone">
            <ToneSelect value={settings.tone} onChange={(tone) => updateDraft({ tone })} disabled={gated} />
          </SettingRow>

          <SettingRow icon={<Calendar className="size-4 text-muted-foreground" />} label="Schedule">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Frequency</span>
                  <ScheduleFrequencySelect
                    value={settings.frequency}
                    onChange={(frequency) => updateDraft({ frequency })}
                    disabled={gated}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Delivery time</span>
                  <DeliveryTimePicker
                    value={settings.deliveryTime}
                    onChange={(deliveryTime) => updateDraft({ deliveryTime })}
                    disabled={gated}
                  />
                </div>
              </div>
              {settings.frequency === "custom" ? (
                <CustomScheduleFields
                  value={settings.customDays}
                  onChange={(customDays: DayOfWeek[]) => updateDraft({ customDays })}
                  disabled={gated}
                />
              ) : null}
            </div>
          </SettingRow>

          {gated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex w-full">{saveButton}</span>
              </TooltipTrigger>
              <TooltipContent>Add at least one interest first</TooltipContent>
            </Tooltip>
          ) : (
            saveButton
          )}
        </div>
      ) : null}
    </div>
  )
}
