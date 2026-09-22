import { ArrowLeft, Podcast } from "lucide-react"
import { Link } from "react-router-dom"
import { EpisodeListItem } from "@/components/episodes/EpisodeListItem"
import { EmptyState } from "@/components/shared/EmptyState"
import { SectionHeading } from "@/components/shared/SectionHeading"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useEpisodeFeedback } from "@/hooks/useEpisodeFeedback"
import { useEpisodes } from "@/hooks/useEpisodes"
import { useMockPlayer } from "@/hooks/useMockPlayer"
import { ROUTES } from "@/lib/constants"

export function EpisodesPage() {
  useDocumentTitle("ProsperPod — Podcasts")

  const { episodes } = useEpisodes()
  const { feedback, setEpisodeFeedback } = useEpisodeFeedback()
  const episodePlayer = useMockPlayer()

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" className="w-fit px-2">
        <Link to={ROUTES.home}>
          <ArrowLeft />
          Back to Home
        </Link>
      </Button>

      <SectionHeading
        title="Your podcasts"
        subtitle={episodes.length > 0 ? `${episodes.length} podcast${episodes.length === 1 ? "" : "s"} generated so far.` : undefined}
      />

      {episodes.length > 0 ? (
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
      ) : (
        <EmptyState
          icon={<Podcast className="size-6" />}
          title="No podcasts yet"
          description="Your first podcast will arrive according to your schedule."
        />
      )}
    </div>
  )
}
