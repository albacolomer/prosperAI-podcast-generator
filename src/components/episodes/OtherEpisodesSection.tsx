import { ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"
import { EpisodeListItem } from "@/components/episodes/EpisodeListItem"
import { SectionHeading } from "@/components/shared/SectionHeading"
import { Button } from "@/components/ui/button"
import { ROUTES } from "@/lib/constants"
import type { Episode, EpisodeFeedback } from "@/types"

interface OtherEpisodesSectionProps {
  episodes: Episode[]
  isPlaying: (id: string) => boolean
  onTogglePlay: (id: string) => void
  feedback: Record<string, EpisodeFeedback>
  onFeedback: (episodeId: string, value: EpisodeFeedback) => void
}

export function OtherEpisodesSection({
  episodes,
  isPlaying,
  onTogglePlay,
  feedback,
  onFeedback,
}: OtherEpisodesSectionProps) {
  if (episodes.length === 0) return null

  return (
    <section>
      <SectionHeading
        title="Recent podcasts"
        action={
          <Button asChild variant="link" className="px-0">
            <Link to={ROUTES.episodes}>
              View all
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        {episodes.map((episode) => (
          <EpisodeListItem
            key={episode.id}
            episode={episode}
            playing={isPlaying(episode.id)}
            onTogglePlay={() => onTogglePlay(episode.id)}
            feedback={feedback[episode.id]}
            onFeedback={(value) => onFeedback(episode.id, value)}
          />
        ))}
      </div>
    </section>
  )
}
