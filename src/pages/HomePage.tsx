import { useState } from "react"
import { toast } from "sonner"
import { LastEpisodeCard } from "@/components/episodes/LastEpisodeCard"
import { OtherEpisodesSection } from "@/components/episodes/OtherEpisodesSection"
import { GreetingHeader } from "@/components/home/GreetingHeader"
import { InterestsSidebarCard } from "@/components/home/InterestsSidebarCard"
import { SettingsSidebarCard } from "@/components/home/SettingsSidebarCard"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useEpisodeFeedback } from "@/hooks/useEpisodeFeedback"
import { useEpisodes } from "@/hooks/useEpisodes"
import { useInterests } from "@/hooks/useInterests"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import { usePodcastSettings } from "@/hooks/usePodcastSettings"

const GENERATE_DELAY_MS = 1600

export function HomePage() {
  useDocumentTitle("Echo — Home")

  const { interests, addInterest, removeInterest, toggleInterestSelected } = useInterests()
  const { settings, updateDraft, save, isDirty } = usePodcastSettings()
  const { episodes, generateEpisode } = useEpisodes()
  const { feedback, setEpisodeFeedback } = useEpisodeFeedback()
  const episodePlayer = useMockPlayer()
  const [generating, setGenerating] = useState(false)

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
    if (!hasInterests) return
    setGenerating(true)
    toast.loading("Generating your next episode…", { id: "generate-episode" })
    window.setTimeout(() => {
      const episode = generateEpisode(selectedInterests, settings)
      setGenerating(false)
      toast.success("New episode ready!", { id: "generate-episode", description: episode.title })
    }, GENERATE_DELAY_MS)
  }

  return (
    <div className="flex flex-col gap-8">
      <GreetingHeader onGenerate={handleGenerate} generating={generating} gated={!hasInterests} />

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
