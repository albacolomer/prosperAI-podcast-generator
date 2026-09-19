import { EpisodeListItem } from "@/components/episodes/EpisodeListItem"
import { SectionHeading } from "@/components/shared/SectionHeading"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useEpisodeFeedback } from "@/hooks/useEpisodeFeedback"
import { useEpisodes } from "@/hooks/useEpisodes"
import { useMockPlayer } from "@/hooks/useMockPlayer"

export function EpisodesPage() {
  useDocumentTitle("Echo — All Episodes")

  const { episodes } = useEpisodes()
  const { feedback, setEpisodeFeedback } = useEpisodeFeedback()
  const episodePlayer = useMockPlayer()

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="All episodes" subtitle={`${episodes.length} episodes generated so far.`} />

      <div className="flex flex-col gap-3">
        {episodes.map((episode) => (
          <EpisodeListItem
            key={episode.id}
            episode={episode}
            playing={episodePlayer.isPlaying(episode.id)}
            onTogglePlay={() => episodePlayer.toggle(episode.id)}
            feedback={feedback[episode.id]}
            onFeedback={(value) => setEpisodeFeedback(episode.id, value)}
          />
        ))}
      </div>
    </div>
  )
}
