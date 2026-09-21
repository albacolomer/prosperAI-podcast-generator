import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { LastEpisodeCard } from "@/components/episodes/LastEpisodeCard"
import { OtherEpisodesSection } from "@/components/episodes/OtherEpisodesSection"
import { GenerationStatusCard } from "@/components/home/GenerationStatusCard"
import { GreetingHeader } from "@/components/home/GreetingHeader"
import { InterestsSidebarCard } from "@/components/home/InterestsSidebarCard"
import { ScheduledRunBanner } from "@/components/home/ScheduledRunBanner"
import { SettingsSidebarCard } from "@/components/home/SettingsSidebarCard"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useEpisodeFeedback } from "@/hooks/useEpisodeFeedback"
import { useEpisodeGeneration } from "@/hooks/useEpisodeGeneration"
import { useEpisodes } from "@/hooks/useEpisodes"
import { useInterests } from "@/hooks/useInterests"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import { usePodcastSettings } from "@/hooks/usePodcastSettings"
import { useSchedule } from "@/hooks/useSchedule"
import { browserTimeZone, buildSchedulePayload, interestsToSync, withInterests } from "@/lib/scheduleApi"
import { SCHEDULE_NEEDS_INTERESTS } from "@/lib/scheduleText"

export function HomePage() {
  useDocumentTitle("ProsperPod — Home")

  const { interests, addInterest, removeInterest, toggleInterestSelected } = useInterests()
  const { settings, updateDraft, save, isDirty, adoptSchedule } = usePodcastSettings()
  const { episodes, addGeneratedEpisode, refresh: refreshEpisodes } = useEpisodes()
  const schedule = useSchedule()
  const { feedback, setEpisodeFeedback } = useEpisodeFeedback()
  const episodePlayer = useMockPlayer()
  const generation = useEpisodeGeneration({
    onEpisode: ({ episode }) => {
      addGeneratedEpisode(episode)
      toast.success("New podcast ready!", { description: episode.title })
    },
  })
  const generating = generation.state.status === "running"

  const [latestEpisode, ...restEpisodes] = episodes
  const otherEpisodes = restEpisodes.slice(0, 3)
  const selectedInterests = interests.filter((interest) => interest.selected)
  const hasInterests = selectedInterests.length > 0

  const selectedLabels = selectedInterests.map((interest) => interest.label)

  // The server is what runs the schedule, so what it holds is the truth: a browser without the settings adopts them once.
  const adopted = useRef(false)
  useEffect(() => {
    const { status } = schedule
    if (adopted.current || !status?.configured) return
    adopted.current = true
    adoptSchedule({
      scheduleEnabled: status.enabled,
      frequency: status.frequency,
      weekday: status.weekday,
      dayOfMonth: status.dayOfMonth,
      deliveryTime: status.deliveryTime,
    })
  }, [schedule, adoptSchedule])

  // The server makes scheduled episodes from its own copy of the interests, so every change here reaches it too, an empty
  // selection included: it must never keep interests the user has removed. The schedule itself is left as it is.
  const { status: scheduleStatus, save: saveSchedule } = schedule
  const pushedInterests = useRef<string | undefined>(undefined)
  useEffect(() => {
    const labels = interests.filter((interest) => interest.selected).map((interest) => interest.label)
    const toSend = interestsToSync(scheduleStatus, labels, pushedInterests.current)
    if (!toSend || !scheduleStatus?.configured) return
    pushedInterests.current = JSON.stringify(toSend)
    void saveSchedule(withInterests(scheduleStatus, toSend)).catch(() => {
      // Tried once per set of interests, so a payload the server refuses is not resent on every poll. The next Save sends it again.
    })
  }, [scheduleStatus, interests, saveSchedule])

  // A scheduled run that finishes while this page is open: say so, and fetch the episode without waiting for the next poll.
  const previousRun = useRef<string | undefined>(undefined)
  useEffect(() => {
    const run = scheduleStatus?.run
    if (!run) return
    const state = `${run.deliveryAt}:${run.status}`
    const before = previousRun.current
    previousRun.current = state
    if (before?.endsWith(":running") && before.startsWith(run.deliveryAt) && run.status === "completed") {
      void refreshEpisodes()
      toast.success("Your scheduled episode is ready!")
    }
  }, [scheduleStatus, refreshEpisodes])

  async function handleSave() {
    // A schedule cannot be switched on without interests. (The button is disabled then; this is the same rule at the source.)
    if (settings.scheduleEnabled && !hasInterests) {
      toast.error(SCHEDULE_NEEDS_INTERESTS)
      return
    }
    save()
    toast.success("Settings saved")
    // The schedule lives on the server. Saving the settings while it is off still records the choice, and never turns it on by itself.
    try {
      await schedule.save(buildSchedulePayload(settings, selectedLabels, browserTimeZone()))
    } catch (error) {
      toast.error("Your schedule could not be saved", { description: error instanceof Error ? error.message : undefined })
    }
  }

  function handleAddInterest(label: string) {
    addInterest(label)
    toast.success(`Added "${label}" to your interests`)
  }

  function handleGenerate() {
    if (!hasInterests || generating) return
    if (scheduleStatus?.run?.status === "running") {
      toast.info("A scheduled podcast is being generated right now", { description: "It will appear here as soon as it is ready." })
      return
    }
    // The user's settings are the whole request: the server runs the pipeline and owns the voice and the 10-minute length.
    void generation.start({
      interests: selectedInterests.map((interest) => interest.label),
      language: settings.language,
      tone: settings.tone,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <GreetingHeader onGenerate={handleGenerate} generating={generating} gated={!hasInterests} scheduleStatus={scheduleStatus} />

      <ScheduledRunBanner run={scheduleStatus?.run} configProblem={scheduleStatus?.configured ? scheduleStatus.configProblem : null} />

      <GenerationStatusCard state={generation.state} onDismissError={generation.dismissError} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <LastEpisodeCard
            episode={latestEpisode}
            playing={episodePlayer.isPlaying(latestEpisode.id)}
            onTogglePlay={() => episodePlayer.toggle(latestEpisode.id)}
            feedback={feedback[latestEpisode.id]}
            onFeedback={(value) => setEpisodeFeedback(latestEpisode.id, value)}
          />

          <OtherEpisodesSection
            episodes={otherEpisodes}
            isPlaying={episodePlayer.isPlaying}
            onTogglePlay={episodePlayer.toggle}
            feedback={feedback}
            onFeedback={setEpisodeFeedback}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <InterestsSidebarCard
            interests={interests}
            onAdd={handleAddInterest}
            onRemove={removeInterest}
            onToggleSelect={toggleInterestSelected}
          />

          <SettingsSidebarCard
            hasInterests={hasInterests}
            settings={settings}
            updateDraft={updateDraft}
            isDirty={isDirty}
            onSave={() => void handleSave()}
          />
        </aside>
      </div>
    </div>
  )
}
