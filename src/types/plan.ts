export type PlannedStoryRole = "main" | "supporting"

/** One story the episode will tell. Evidence is selected by the story-local ids Research items get by position (f1, c1, a1, q1, d1). */
export interface PlannedStory {
  storyId: string
  role: PlannedStoryRole
  /** Airtime for this story, including the lead-in that connects it to the previous one. */
  targetWords: number
  selectedFactIds: string[]
  selectedContextIds: string[]
  selectedAnalysisIds: string[]
  selectedQuoteIds: string[]
  selectedDisagreementIds: string[]
  /** Editorial planning metadata (why the story is here, what it contributes). Never evidence. */
  reason: string
}

/** A researched story the planner decided not to use. */
export interface PlannedOmission {
  storyId: string
  reason: string
}

/**
 * What an evidence-grounded connection rests on. A conceptual link ("both are about AI", a plausible broader trend)
 * is none of these and is not a connection.
 */
export type ConnectionBasisType = "shared-actor" | "same-entity-or-event" | "same-location" | "same-fact" | "stated-by-source"

/** A relationship between two planned stories that the selected evidence itself supports on both sides. */
export interface PlannedConnection {
  fromStoryId: string
  toStoryId: string
  basisType: ConnectionBasisType
  /** The named thing the two stories share (a person, company, project, place, event or fact), as the evidence words it. */
  basis: string
  /** How the two stories relate, stated no more strongly than the basis shows. Direction for the writer, not evidence. */
  idea: string
  /** Selected evidence ids ("f1", "c2", ...) of the from-story and the to-story that both mention the basis. */
  fromEvidenceIds: string[]
  toEvidenceIds: string[]
}

/** The editorial plan for one episode: what to tell, in what order and with how much airtime. No prose. */
export interface EpisodePlan {
  /** Working title, in the episode language. The writer may refine it. */
  title: string
  /** The editorial angle, or a plain statement that the stories share no single throughline (which is fine). */
  angle: string
  /** Derived by the server: the first planned story. */
  openingStoryId: string
  /** Derived by the server: the last planned story. */
  endingStoryId: string
  /** In speaking order. */
  stories: PlannedStory[]
  omitted: PlannedOmission[]
  connections: PlannedConnection[]
  hookTargetWords: number
  outroTargetWords: number
  /** Derived by the server: hook + stories + outro. */
  totalTargetWords: number
  /** Changes the server made to the planner's answer (for example a second quote dropped), so they are never silent. */
  adjustments: string[]
}
