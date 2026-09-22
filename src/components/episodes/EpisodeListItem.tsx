import { Download, FileText, Link2, MoreVertical } from "lucide-react"
import { useState } from "react"
import { EpisodeThumbnail } from "@/components/episodes/EpisodeThumbnail"
import { FeedbackButtons } from "@/components/episodes/FeedbackButtons"
import { EpisodeAudioElement } from "@/components/shared/EpisodeAudioElement"
import { PlayButton } from "@/components/shared/PlayButton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

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

        {episode.audioUrl ? <EpisodeAudioElement src={episode.audioUrl} playing={playing} onStop={onTogglePlay} /> : null}
        <PlayButton playing={playing} onClick={onTogglePlay} label={episode.title} />

        <FeedbackButtons value={feedback} onChange={onFeedback} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-label={`More options for ${episode.title}`}>
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {episode.downloadUrl ? (
              <DropdownMenuItem asChild>
                <a href={episode.downloadUrl} download={episode.downloadFilename}>
                  <Download />
                  Download MP3
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setSummaryOpen(true)
              }}
            >
              <FileText />
              View summary
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setSourcesOpen(true)
              }}
            >
              <Link2 />
              See sources
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{episode.title}</DialogTitle>
            <DialogDescription>{episode.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {episode.topics.map((topic) => (
              <Badge key={topic} variant="secondary">
                {topic}
              </Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sources</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {episode.sources.map((source) => (
              <li key={source.name}>{source.name}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
