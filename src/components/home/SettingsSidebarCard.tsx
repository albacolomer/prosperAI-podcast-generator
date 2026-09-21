import { Calendar, ChevronUp, Globe, MessageSquareText, Settings2 } from "lucide-react"
import { type ReactNode, useState } from "react"
import { LanguageSelect } from "@/components/settings/LanguageSelect"
import { ScheduleFields } from "@/components/settings/ScheduleFields"
import { ToneSelect } from "@/components/settings/ToneSelect"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { PodcastSettings } from "@/types"

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
  // Secondary to the Generate button: closed until the user opens it. It stays as they leave it while the page is open.
  const [expanded, setExpanded] = useState(false)
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
        aria-expanded={expanded}
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

          <SettingRow icon={<MessageSquareText className="size-4 text-muted-foreground" />} label="Tone">
            <ToneSelect value={settings.tone} onChange={(tone) => updateDraft({ tone })} disabled={gated} />
          </SettingRow>

          <SettingRow icon={<Calendar className="size-4 text-muted-foreground" />} label="Schedule">
            <ScheduleFields settings={settings} updateDraft={updateDraft} disabled={gated} hasInterests={hasInterests} />
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
