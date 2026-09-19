import { EpisodeThumbnail } from "@/components/episodes/EpisodeThumbnail"
import { FeedbackButtons } from "@/components/episodes/FeedbackButtons"
import { PlayButton } from "@/components/shared/PlayButton"
import { Card, CardContent } from "@/components/ui/card"
import { formatDuration, formatRelativeDate } from "@/lib/format"
import type { Episode, EpisodeFeedback } from "@/types"

interface EpisodeListItemProps {
  episode: Episode
  playing: boolean
  onTogglePlay: () => void
  feedback: EpisodeFeedback | undefined
  onFeedback: (value: EpisodeFeedback) => void
}

export function EpisodeListItem({ episode, playing, onTogglePlay, feedback, onFeedback }: EpisodeListItemProps) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardContent className="flex items-center gap-4">
        <EpisodeThumbnail gradient={episode.coverGradient} className="size-16 rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{episode.title}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeDate(episode.publishedAt)}</p>
          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{episode.summary}</p>
        </div>

        <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">
          {formatDuration(episode.durationSeconds)}
        </span>

        <PlayButton playing={playing} onClick={onTogglePlay} label={episode.title} />

        <FeedbackButtons value={feedback} onChange={onFeedback} />
      </CardContent>
    </Card>
  )
}
