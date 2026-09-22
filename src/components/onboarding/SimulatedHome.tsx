import { useState } from "react"
import { toast } from "sonner"
import { LastEpisodeCard } from "@/components/episodes/LastEpisodeCard"
import { OtherEpisodesSection } from "@/components/episodes/OtherEpisodesSection"
import { GenerationStatusCard } from "@/components/home/GenerationStatusCard"
import { GreetingHeader } from "@/components/home/GreetingHeader"
import { InterestsSidebarCard } from "@/components/home/InterestsSidebarCard"
import { ScheduledRunBanner } from "@/components/home/ScheduledRunBanner"
import { SettingsSidebarCard } from "@/components/home/SettingsSidebarCard"
import { createInterest } from "@/hooks/useInterests"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import type { Episode, EpisodeFeedback, Interest, PodcastSettings } from "@/types"
import { EPISODE_DURATION_MINUTES } from "@/types"
import type { OnboardingAnswers } from "@/types/onboarding"

interface SimulatedHomeProps {
  episode: Episode
  answers: OnboardingAnswers
}

function buildDemoSettings(answers: OnboardingAnswers): PodcastSettings {
  return {
    language: answers.language,
    durationMinutes: EPISODE_DURATION_MINUTES,
    tone: answers.tone,
    // On here so the schedule the user just picked is visible immediately — this is local demo state only, never
    // sent to the server, so it can't arm a real recurring generation.
    scheduleEnabled: true,
    frequency: answers.schedule.frequency,
    weekday: answers.schedule.weekday,
    dayOfMonth: answers.schedule.dayOfMonth,
    deliveryTime: answers.schedule.deliveryTime,
  }
}

/**
 * A self-contained stand-in for Home, rendered only inside `/onboarding`. It reuses Home's own presentational pieces
 * (episode card, Interests, Podcast Settings) but every prop is local component state seeded from the onboarding
 * answers — nothing here reads or writes the real `useInterests`/`usePodcastSettings`/`useEpisodes` storage, and no
 * network request is made. Leaving `/onboarding` leaves this state behind; the real Home is never touched.
 */
export function SimulatedHome({ episode, answers }: SimulatedHomeProps) {
  const [interests, setInterests] = useState<Interest[]>(() => answers.interests.map((label) => createInterest(label)))
  const [settings, setSettings] = useState<PodcastSettings>(() => buildDemoSettings(answers))
  const [initialSettings] = useState(settings)
  const player = useMockPlayer()
  const [feedback, setFeedback] = useState<Record<string, EpisodeFeedback>>({})

  const hasInterests = interests.some((interest) => interest.selected)
  const isDirty = JSON.stringify(settings) !== JSON.stringify(initialSettings)

  function handleAddInterest(label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    setInterests((prev) => {
      if (prev.some((interest) => interest.label.toLowerCase() === trimmed.toLowerCase())) return prev
      return [...prev, createInterest(trimmed)]
    })
  }

  function handleRemoveInterest(id: string) {
    setInterests((prev) => prev.filter((interest) => interest.id !== id))
  }

  function handleToggleInterest(id: string) {
    setInterests((prev) => prev.map((interest) => (interest.id === id ? { ...interest, selected: !interest.selected } : interest)))
  }

  function handleGenerate() {
    toast.info("This is a demo of your first podcast", {
      description: "Generating another episode isn't available in the onboarding preview.",
    })
  }

  function handleSaveSettings() {
    toast.success("Settings saved", { description: "This is a preview — nothing is sent to the server." })
  }

  return (
    <div className="flex flex-col gap-8">
      <GreetingHeader onGenerate={handleGenerate} generating={false} gated={false} scheduleStatus={null} />

      <ScheduledRunBanner run={null} configProblem={null} />
      <GenerationStatusCard state={{ status: "idle" }} onDismissError={() => {}} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          <LastEpisodeCard
            episode={episode}
            playing={player.isPlaying(episode.id)}
            onTogglePlay={() => player.toggle(episode.id)}
            feedback={feedback[episode.id]}
            onFeedback={(value) => setFeedback((prev) => ({ ...prev, [episode.id]: value }))}
          />

          <OtherEpisodesSection episodes={[]} isPlaying={player.isPlaying} onTogglePlay={player.toggle} feedback={feedback} onFeedback={() => {}} />
        </div>

        <aside className="flex flex-col gap-6">
          <InterestsSidebarCard interests={interests} onAdd={handleAddInterest} onRemove={handleRemoveInterest} onToggleSelect={handleToggleInterest} />

          <SettingsSidebarCard hasInterests={hasInterests} settings={settings} updateDraft={(partial) => setSettings((prev) => ({ ...prev, ...partial }))} isDirty={isDirty} onSave={handleSaveSettings} />
        </aside>
      </div>
    </div>
  )
}
