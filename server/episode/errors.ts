import type { FailureStage } from "../../src/types/generation.js"

/** What the user is told for each stage that can fail. Nothing here carries provider bodies, keys or stack traces. */
export const STAGE_MESSAGES: Record<FailureStage, string> = {
  config: "Episode generation is not configured on the server.",
  news: "We couldn't find enough recent stories for your interests.",
  ranking: "We couldn't select stories for this episode.",
  research: "We couldn't research enough stories to generate this episode.",
  script: "We couldn't generate a reliable script for this episode.",
  validation: "We couldn't validate this episode reliably.",
  audio: "The episode script was generated, but we couldn't generate the audio.",
  storage: "The episode audio was generated, but we couldn't save it.",
  cancelled: "Episode generation was cancelled.",
}

/** A failure of one stage of the episode pipeline. The message is always the safe, user-facing one for that stage. */
export class EpisodeGenerationError extends Error {
  readonly stage: FailureStage

  constructor(stage: FailureStage) {
    super(STAGE_MESSAGES[stage])
    this.name = "EpisodeGenerationError"
    this.stage = stage
  }
}
