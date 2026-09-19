import { FileText, Link2 } from "lucide-react"
import { EpisodeThumbnail } from "@/components/episodes/EpisodeThumbnail"
import { FeedbackButtons } from "@/components/episodes/FeedbackButtons"
import { AudioScrubber } from "@/components/shared/AudioScrubber"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PODCAST_SHOW_NAME } from "@/data/mockUser"
import { formatDuration, formatEpisodeDate } from "@/lib/format"
import type { Episode, EpisodeFeedback } from "@/types"

interface LastEpisodeCardProps {
  episode: Episode
  playing: boolean
  onTogglePlay: () => void
  feedback: EpisodeFeedback | undefined
  onFeedback: (value: EpisodeFeedback) => void
}

export function LastEpisodeCard({ episode, playing, onTogglePlay, feedback, onFeedback }: LastEpisodeCardProps) {
  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-col sm:flex-row">
        <EpisodeThumbnail
          gradient={episode.coverGradient}
          className="aspect-16/10 w-full rounded-none sm:aspect-auto sm:w-72"
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent p-4 pt-12 text-white">
            <p className="font-semibold">{PODCAST_SHOW_NAME}</p>
            <p className="text-xs text-white/80">
              {formatEpisodeDate(episode.publishedAt)} · {formatDuration(episode.durationSeconds)}
            </p>
          </div>
        </EpisodeThumbnail>

        <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Latest episode</p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">{episode.title}</h3>
          <p className="text-sm text-muted-foreground">{episode.summary}</p>

          <AudioScrubber
            episodeId={episode.id}
            durationSeconds={episode.durationSeconds}
            playing={playing}
            onTogglePlay={onTogglePlay}
            label={episode.title}
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="rounded-full">
                  <FileText />
                  View summary
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <p className="mb-2 text-sm font-medium text-foreground">{episode.title}</p>
                <p className="mb-3 text-sm text-muted-foreground">{episode.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {episode.topics.map((topic) => (
                    <Badge key={topic} variant="secondary">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="secondary" size="sm" className="rounded-full">
                  <Link2 />
                  See sources
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <p className="mb-2 text-sm font-medium text-foreground">Sources</p>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {episode.sources.map((source) => (
                    <li key={source.name}>{source.name}</li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            <FeedbackButtons value={feedback} onChange={onFeedback} className="ml-auto" />
          </div>
        </div>
      </div>
    </Card>
  )
}
