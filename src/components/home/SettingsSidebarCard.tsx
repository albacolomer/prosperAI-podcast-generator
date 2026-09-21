import { Calendar, ChevronUp, Clock, Globe, MessageSquareText, Settings2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { LanguageSelect } from "@/components/settings/LanguageSelect"
import { ScheduleFields } from "@/components/settings/ScheduleFields"
import { ToneSelect } from "@/components/settings/ToneSelect"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { EPISODE_DURATION_MINUTES } from "@/types"
import type { PodcastSettings, ScheduleStatus } from "@/types"

interface SettingsSidebarCardProps {
  hasInterests: boolean
  settings: PodcastSettings
  updateDraft: (partial: Partial<PodcastSettings>) => void
  isDirty: boolean
  onSave: () => void
  /** The schedule as the server holds it; `null` until it has answered. */
  scheduleStatus: ScheduleStatus | null
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

export function SettingsSidebarCard({ hasInterests, settings, updateDraft, isDirty, onSave, scheduleStatus }: SettingsSidebarCardProps) {
  const [expanded, setExpanded] = useState(true)
  const gated = !hasInterests
  // Without interests the only change worth saving is switching the schedule off; everything else is gated.
  const saveBlocked = gated && settings.scheduleEnabled

  const saveButton = (
    <Button type="button" onClick={onSave} disabled={saveBlocked || !isDirty} className="w-full rounded-full">
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
          Podcast settings
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
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium text-foreground">
                {formatDuration(EPISODE_DURATION_MINUTES * 60)}
              </span>
              <span className="text-xs text-muted-foreground">Every episode is 10 minutes</span>
            </div>
          </SettingRow>

          <SettingRow icon={<MessageSquareText className="size-4 text-muted-foreground" />} label="Tone">
            <ToneSelect value={settings.tone} onChange={(tone) => updateDraft({ tone })} disabled={gated} />
          </SettingRow>

          <SettingRow icon={<Calendar className="size-4 text-muted-foreground" />} label="Schedule">
            <ScheduleFields settings={settings} updateDraft={updateDraft} disabled={gated} hasInterests={hasInterests} status={scheduleStatus} />
          </SettingRow>

          {saveBlocked ? (
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
