import { useState } from "react"
import type { Article } from "@/types"

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function NewsDebugArticle({ article, index }: { article: Article; index: number }) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <span className="w-6 shrink-0 text-right text-muted-foreground">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">{article.title}</p>
        <p className="text-muted-foreground">
          {article.source} · {timeAgo(article.publishedAt)} · {article.publishedAt}
        </p>
        <p>
          <span className="text-muted-foreground">Interests: </span>
          {article.interests.join(", ")}
        </p>
        <a href={article.url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">
          {article.url}
        </a>
        <p className="mt-1 text-foreground/80">{article.description || <em>(no description)</em>}</p>
        <p className="text-muted-foreground">id: {article.id}</p>
      </div>
      {article.imageUrl && !imageFailed ? (
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-20 w-32 shrink-0 rounded border border-border object-cover"
        />
      ) : (
        <span className="w-32 shrink-0 text-right text-muted-foreground">
          {article.imageUrl ? "(image failed)" : "(no image)"}
        </span>
      )}
    </li>
  )
}
