import { toast } from "sonner"
import { LastEpisodeCard } from "@/components/episodes/LastEpisodeCard"
import { OtherEpisodesSection } from "@/components/episodes/OtherEpisodesSection"
import { GenerationStatusCard } from "@/components/home/GenerationStatusCard"
import { GreetingHeader } from "@/components/home/GreetingHeader"
import { InterestsSidebarCard } from "@/components/home/InterestsSidebarCard"
import { SettingsSidebarCard } from "@/components/home/SettingsSidebarCard"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useEpisodeFeedback } from "@/hooks/useEpisodeFeedback"
import { useEpisodeGeneration } from "@/hooks/useEpisodeGeneration"
import { useEpisodes } from "@/hooks/useEpisodes"
import { useInterests } from "@/hooks/useInterests"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import { usePodcastSettings } from "@/hooks/usePodcastSettings"

export function HomePage() {
  useDocumentTitle("ProsperPod — Home")

  const { interests, addInterest, removeInterest, toggleInterestSelected } = useInterests()
  const { settings, updateDraft, save, isDirty } = usePodcastSettings()
  const { episodes, addGeneratedEpisode } = useEpisodes()
  const { feedback, setEpisodeFeedback } = useEpisodeFeedback()
  const episodePlayer = useMockPlayer()
  const generation = useEpisodeGeneration({
    onEpisode: ({ episode }) => {
      addGeneratedEpisode(episode)
      toast.success("New episode ready!", { description: episode.title })
    },
  })
  const generating = generation.state.status === "running"

  const [latestEpisode, ...restEpisodes] = episodes
  const otherEpisodes = restEpisodes.slice(0, 3)
  const selectedInterests = interests.filter((interest) => interest.selected)
  const hasInterests = selectedInterests.length > 0

  function handleSave() {
    save()
    toast.success("Settings saved")
  }

  function handleAddInterest(label: string) {
    addInterest(label)
    toast.success(`Added "${label}" to your interests`)
  }

  function handleGenerate() {
    if (!hasInterests || generating) return
    // The user's settings are the whole request: the server runs the pipeline and owns the voice.
    void generation.start({
      interests: selectedInterests.map((interest) => interest.label),
      language: settings.language,
      durationMinutes: settings.durationMinutes,
      tone: settings.tone,
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <GreetingHeader onGenerate={handleGenerate} generating={generating} gated={!hasInterests} />

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
            onSave={handleSave}
          />
        </aside>
      </div>
    </div>
  )
}
