export type RankingErrorKind = "not-configured" | "timeout" | "upstream" | "invalid-output"

/**
 * A ranking failure whose message is safe to show to the caller: it never carries
 * secrets, prompts, or raw upstream error bodies.
 */
export class RankingError extends Error {
  readonly kind: RankingErrorKind

  constructor(kind: RankingErrorKind, message: string) {
    super(message)
    this.name = "RankingError"
    this.kind = kind
  }
}

export function statusForRankingError(error: RankingError): number {
  switch (error.kind) {
    case "not-configured":
      return 503
    case "timeout":
      return 504
    case "upstream":
    case "invalid-output":
      return 502
  }
}
