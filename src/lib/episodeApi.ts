import type { EpisodeResult, FailureStage, GenerationEvent, ProgressEvent, Tone } from "@/types"

/** The user's settings, and nothing else: the voice is server configuration and the duration is fixed, so neither is part of the request. */
export interface GenerateEpisodeParams {
  interests: string[]
  language: string
  tone: Tone
}

/** A failed generation. The message is the server's user-facing one for the stage that failed. */
export class EpisodeGenerationFailure extends Error {
  readonly stage: FailureStage | undefined

  constructor(message: string, stage?: FailureStage) {
    super(message)
    this.name = "EpisodeGenerationFailure"
    this.stage = stage
  }
}

const INTERRUPTED = "The connection was interrupted before the episode was ready. Please try again."

function parseEvent(line: string): GenerationEvent | undefined {
  try {
    const event: unknown = JSON.parse(line)
    if (typeof event === "object" && event !== null && "type" in event) return event as GenerationEvent
  } catch {
    // A line that is not JSON is ignored rather than failing an episode that may still finish.
  }
  return undefined
}

/**
 * Starts the whole pipeline on the server and follows it. `onProgress` is called for each stage the server reports
 * as started or finished, so what the UI shows is what actually happened. Resolves with the stored episode.
 */
export async function generateEpisode({
  interests,
  language,
  tone,
  signal,
  onProgress,
}: GenerateEpisodeParams & { signal?: AbortSignal; onProgress?: (event: ProgressEvent) => void }): Promise<EpisodeResult> {
  const response = await fetch("/api/generate-episode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Fields are picked explicitly so nothing else that is in the settings (a stale voice, say) is ever sent.
    body: JSON.stringify({ interests, language, tone }),
    signal,
  })

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new EpisodeGenerationFailure(body?.error ?? `Episode request failed (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ""

  const handle = (line: string): EpisodeResult | undefined => {
    const event = line.trim() ? parseEvent(line) : undefined
    if (!event) return undefined
    if (event.type === "progress") onProgress?.({ stage: event.stage, status: event.status })
    if (event.type === "error") throw new EpisodeGenerationFailure(event.message, event.stage)
    if (event.type === "result") return { episode: event.episode, stats: event.stats }
    return undefined
  }

  for (;;) {
    const { done, value } = await reader.read()
    buffered += decoder.decode(value, { stream: !done })
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) {
      const result = handle(line)
      if (result) return result
    }
    if (done) break
  }
  const result = handle(buffered)
  if (result) return result
  throw new EpisodeGenerationFailure(INTERRUPTED)
}
