import type { EpisodePlan } from "./plan.js"
import type { ScriptValidation } from "./validation.js"

export type ScriptSegmentType = "hook" | "intro" | "story" | "transition" | "outro"

/** One spoken part of the episode. Joined in order, the segments are the whole script. */
export interface ScriptSegment {
  type: ScriptSegmentType
  text: string
  /** Articles this part draws on (for attribution). A callback to an earlier story can repeat an id. */
  articleIds: string[]
}

/** A selected story the writer decided not to use. */
export interface OmittedStory {
  articleId: string
  reason: string
}

export interface ScriptStats {
  storiesProvided: number
  /** Distinct articles referenced by at least one segment. */
  storiesCovered: number
  storiesOmitted: number
  wordCount: number
  targetWords: number
  targetMinutes: number
  /** wordCount at the spoken-word rate, so it can be compared with targetMinutes. */
  estimatedMinutes: number
  model: string
  /** Time spent on the writer's OpenAI call, in milliseconds. */
  durationMs: number
}

/** One LLM stage of the episode pipeline. */
export interface StageInfo {
  model: string
  /** Time spent on the OpenAI call, in milliseconds. */
  durationMs: number
}

export interface ScriptStages {
  planner: StageInfo
  writer: StageInfo
  validator: StageInfo
  /** Wall-clock time for plan + write + validate, in milliseconds. */
  totalMs: number
}

export interface ScriptResponse {
  title: string
  segments: ScriptSegment[]
  /** Stories the plan left out (the planner owns omission). */
  omitted: OmittedStory[]
  /** The complete spoken script: every segment's text, in order. */
  script: string
  stats: ScriptStats
  /** The editorial plan the script was written from. */
  plan: EpisodePlan
  /** The quality gate: deterministic checks plus the AI evidence review. Failure is reported, never repaired. */
  validation: ScriptValidation
  stages: ScriptStages
  /** The server's signature over `script`, present only when validation passed. POST /api/generate-audio requires it. */
  audioToken?: string
}
