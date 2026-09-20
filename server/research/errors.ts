export type ResearchErrorKind = "not-configured" | "timeout" | "upstream" | "invalid-output"

/**
 * A research failure whose message is safe to show to the caller: it never carries
 * secrets, prompts, extracted page content, or raw upstream error bodies.
 */
export class ResearchError extends Error {
  readonly kind: ResearchErrorKind

  constructor(kind: ResearchErrorKind, message: string) {
    super(message)
    this.name = "ResearchError"
    this.kind = kind
  }
}

export function statusForResearchError(error: ResearchError): number {
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
