export type ValidationSeverity = "error" | "warning"

/** "deterministic" checks are exact rules; "ai" issues come from the evidence-checking reviewer. */
export type ValidationSource = "deterministic" | "ai"

export interface ValidationIssue {
  source: ValidationSource
  /** Kebab-case category, e.g. "word-count-exceeded", "quote-unverified", "unsupported-claim". */
  type: string
  severity: ValidationSeverity
  message: string
  /** 1-based position in the script's segments; absent when the issue concerns the whole script. */
  segmentIndex?: number
  /** The script text the issue is about. */
  excerpt?: string
  /** Research items involved, as "<storyId>:<itemId>" (for example "abc123:f4"). */
  evidenceIds?: string[]
}

/** passed: the AI review found problems, or ran clean. unavailable: the review call failed. */
export type AiReviewStatus = "passed" | "issues" | "unavailable"

export interface ScriptValidation {
  /** True when there is no issue of severity "error". Warnings never block. */
  passed: boolean
  issues: ValidationIssue[]
  stats: {
    wordCount: number
    targetWords: number
    maxWords: number
    /** Below this many words the script only gets a warning: duration is a target, not a minimum. */
    minWords: number
    storiesPlanned: number
    storiesCovered: number
    /** Quotation-marked passages that matched a verified quote. */
    quotesUsed: number
    errors: number
    warnings: number
    aiReview: AiReviewStatus
  }
}
