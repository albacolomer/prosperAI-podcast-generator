import type { EpisodePlan } from "../../src/types/plan.js"
import type { ScriptSegment } from "../../src/types/script.js"
import type { ValidationIssue } from "../../src/types/validation.js"
import { countWords, hasDirectSpeech, isDirectSpeech, normalizeForQuoteMatch, quotedPassages } from "../shared/text.js"
import { qualifiedId } from "./evidence.js"
import type { IndexedStory } from "./evidence.js"
import { maxWordsFor, minWordsFor, targetWordsFor } from "./options.js"
import type { LanguageCode } from "./options.js"

/** A passage in quotation marks this long that matches no verified quote is an invented or altered quote. */
const MIN_UNVERIFIED_QUOTE_WORDS = 4
/** A segment may run this far over its planned share before it is flagged (planning is approximate). */
const SEGMENT_BUDGET_SLACK = 1.5
const SEGMENT_BUDGET_SLACK_WORDS = 30
const EXCERPT_CHARS = 160
/** Editorial ceilings per story. Guidelines for the planner (not required to be filled), so exceeding one only warns. */
const MAX_PLANNED_FACTS = 5
const MAX_PLANNED_CONTEXT = 2
const MAX_PLANNED_ANALYSIS = 1

export interface CheckInput {
  segments: readonly ScriptSegment[]
  language: LanguageCode
  durationMinutes: number
  plan: EpisodePlan
  /** Every researched story the request carried, indexed. */
  stories: readonly IndexedStory[]
}

export interface CheckResult {
  issues: ValidationIssue[]
  wordCount: number
  storiesCovered: number
  quotesUsed: number
}

/** Writing systems the non-Latin languages must be written in. Latin-script languages are left to the AI review. */
const LANGUAGE_SCRIPTS: Partial<Record<LanguageCode, RegExp>> = {
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u,
  zh: /\p{Script=Han}/u,
  hi: /\p{Script=Devanagari}/u,
  ar: /\p{Script=Arabic}/u,
  ru: /\p{Script=Cyrillic}/u,
}

const PLAIN_TEXT_RULES: { pattern: RegExp; problem: string }[] = [
  { pattern: /https?:\/\/|www\./i, problem: "a URL" },
  { pattern: /\[[^\]]*\]|<[^>]+>/, problem: "a bracketed note or tag" },
  { pattern: /\*\*|__|`/, problem: "markdown emphasis" },
  { pattern: /(^|\n)\s{0,3}(#{1,6}\s|[-*•]\s)/, problem: "a markdown heading or bullet" },
  { pattern: /\p{Extended_Pictographic}/u, problem: "an emoji" },
]

const excerptOf = (text: string) => (text.length <= EXCERPT_CHARS ? text : `${text.slice(0, EXCERPT_CHARS - 1)}…`)

/** The comparable core of a quoted passage: typography, case and surrounding punctuation ignored. */
function quoteCore(text: string): string {
  return normalizeForQuoteMatch(text).replace(/^[\s.,;:!?…"'-]+|[\s.,;:!?…"'-]+$/g, "")
}

function speakerMentioned(speaker: string, text: string): boolean {
  const haystack = text.toLowerCase()
  const names = speaker.split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 3)
  return names.length === 0 || names.some((name) => haystack.includes(name.toLowerCase()))
}

/**
 * The exact-rule half of the validator. Everything here can be decided without judgement: length, ids, structure,
 * plan coverage, the plain-text format the voice needs, the language's writing system and, above all, that every
 * passage in quotation marks is a verified quote. Returns issues; it never throws and never edits the script.
 */
export function runChecks({ segments, language, durationMinutes, plan, stories }: CheckInput): CheckResult {
  const issues: ValidationIssue[] = []
  const add = (issue: Omit<ValidationIssue, "source">) => issues.push({ source: "deterministic", ...issue })

  const script = segments.map((segment) => segment.text.trim()).join("\n\n")
  const wordCount = countWords(script, language)
  const targetWords = targetWordsFor(durationMinutes)
  const maxWords = maxWordsFor(durationMinutes)
  const minWords = minWordsFor(durationMinutes)

  // Length: over the ceiling is a hard failure; under 75% of the target is only worth a note.
  if (wordCount > maxWords) {
    add({
      type: "word-count-exceeded",
      severity: "error",
      message: `The script has ${wordCount} words, over the ${maxWords}-word maximum (target ${targetWords}).`,
    })
  } else if (wordCount < minWords) {
    add({
      type: "word-count-low",
      severity: "warning",
      message: `The script has ${wordCount} words, under 75% of the ${targetWords}-word target. Acceptable when the evidence is thin.`,
    })
  }

  // Structure: one hook first, one outro last, at least one story.
  const hooks = segments.filter((segment) => segment.type === "hook").length
  const outros = segments.filter((segment) => segment.type === "outro").length
  if (segments[0]?.type !== "hook") add({ type: "missing-hook", severity: "error", message: "The episode does not open with a hook." })
  if (hooks > 1) add({ type: "multiple-hooks", severity: "error", message: `The episode has ${hooks} hooks; it must have exactly one.` })
  if (segments[segments.length - 1]?.type !== "outro") {
    add({ type: "missing-outro", severity: "error", message: "The episode does not close with an outro." })
  }
  if (outros > 1) add({ type: "multiple-outros", severity: "error", message: `The episode has ${outros} outros; it must have exactly one.` })
  if (!segments.some((segment) => segment.type === "story")) {
    add({ type: "no-story-segment", severity: "error", message: "The episode has no story segment." })
  }

  // Ids: every article id must be a real story, in the plan, listed once per segment; every planned story must be told.
  const known = new Map(stories.map((indexed) => [indexed.story.storyId, indexed]))
  const plannedIds = plan.stories.map((entry) => entry.storyId)
  const planned = new Set(plannedIds)
  const covered = new Set<string>()
  const firstSeen: string[] = []
  segments.forEach((segment, index) => {
    const segmentIndex = index + 1
    const seen = new Set<string>()
    if (segment.type === "story" && segment.articleIds.length === 0) {
      add({ type: "story-segment-without-article", severity: "error", message: "A story segment does not reference any story.", segmentIndex })
    }
    for (const id of segment.articleIds) {
      if (seen.has(id)) {
        add({ type: "duplicate-story-id", severity: "error", message: `The segment lists story "${id}" more than once.`, segmentIndex })
        continue
      }
      seen.add(id)
      if (!known.has(id)) {
        add({ type: "unknown-story-id", severity: "error", message: `The segment references "${id}", which is not one of the provided stories.`, segmentIndex })
      } else if (!planned.has(id)) {
        add({ type: "unplanned-story", severity: "error", message: `The segment references "${id}", a story the plan left out.`, segmentIndex })
      } else {
        covered.add(id)
        if (!firstSeen.includes(id)) firstSeen.push(id)
      }
    }
  })
  for (const id of plannedIds) {
    if (!covered.has(id)) add({ type: "planned-story-missing", severity: "error", message: `The planned story "${id}" is not told in any segment.` })
  }
  const expectedOrder = plannedIds.filter((id) => covered.has(id))
  if (firstSeen.join("|") !== expectedOrder.join("|")) {
    add({ type: "story-order", severity: "warning", message: "The stories first appear in a different order than the plan." })
  }

  // The hook belongs to the opening story: listing another story's id means it previews the episode.
  const hookIndex = segments.findIndex((segment) => segment.type === "hook")
  if (hookIndex >= 0) {
    const extra = segments[hookIndex].articleIds.filter((id) => id !== plan.openingStoryId)
    if (extra.length > 0) {
      add({ type: "hook-previews-stories", severity: "warning", message: "The hook refers to stories other than the opening one, which previews the episode.", segmentIndex: hookIndex + 1 })
    }
  }

  // Airtime: a segment far over its planned share is flagged, never blocked (the total is the hard limit).
  const overBudget = (words: number, planned: number) => words > planned * SEGMENT_BUDGET_SLACK + SEGMENT_BUDGET_SLACK_WORDS
  segments.forEach((segment, index) => {
    const words = countWords(segment.text, language)
    const segmentIndex = index + 1
    if (segment.type === "hook" && overBudget(words, plan.hookTargetWords)) {
      add({ type: "segment-over-budget", severity: "warning", message: `The hook has ${words} words against a plan of ${plan.hookTargetWords}.`, segmentIndex })
    } else if (segment.type === "outro" && overBudget(words, plan.outroTargetWords)) {
      add({ type: "segment-over-budget", severity: "warning", message: `The outro has ${words} words against a plan of ${plan.outroTargetWords}.`, segmentIndex })
    } else if (segment.type === "story" && segment.articleIds.length === 1) {
      const entry = plan.stories.find(({ storyId }) => storyId === segment.articleIds[0])
      if (entry && overBudget(words, entry.targetWords)) {
        add({ type: "segment-over-budget", severity: "warning", message: `A story segment has ${words} words against a plan of ${entry.targetWords} for "${entry.storyId}".`, segmentIndex })
      }
    }
  })

  // Plain text the voice can read aloud.
  segments.forEach((segment, index) => {
    for (const { pattern, problem } of PLAIN_TEXT_RULES) {
      if (pattern.test(segment.text)) {
        add({ type: "plain-text", severity: "error", message: `The segment contains ${problem}; the script must be plain spoken text.`, segmentIndex: index + 1 })
      }
    }
  })

  // Language: only decidable by writing system for the non-Latin languages.
  const languageScript = LANGUAGE_SCRIPTS[language]
  if (languageScript) {
    const letters = script.match(/\p{L}/gu) ?? []
    const inScript = letters.filter((letter) => languageScript.test(letter)).length
    if (letters.length > 0 && inScript / letters.length < 0.5) {
      add({ type: "language-mismatch", severity: "error", message: `Less than half of the script's letters are in the writing system expected for "${language}".` })
    }
  }

  // Quotes: every passage in quotation marks must be a verified quote of a story the segment tells.
  let quotesUsed = 0
  segments.forEach((segment, index) => {
    const segmentIndex = index + 1
    const own = segment.articleIds.flatMap((id) => (planned.has(id) && known.has(id) ? [known.get(id) as IndexedStory] : []))
    const selected = own.flatMap((indexed) => {
      const entry = plan.stories.find(({ storyId }) => storyId === indexed.story.storyId)
      return indexed.quotes.filter(({ id }) => entry?.selectedQuoteIds.includes(id)).map((quote) => ({ quote, storyId: indexed.story.storyId }))
    })
    const unselected = own.flatMap((indexed) => indexed.quotes.map((quote) => ({ quote, storyId: indexed.story.storyId })))
    const elsewhere = stories.flatMap((indexed) => indexed.quotes.map((quote) => ({ quote, storyId: indexed.story.storyId })))
    const find = (pool: typeof selected, core: string) => pool.find(({ quote }) => quoteCore(quote.text).includes(core))

    for (const passage of quotedPassages(segment.text)) {
      const span = passage.text
      const core = quoteCore(span)
      if (!core) continue
      const excerpt = excerptOf(span)

      const inPlan = find(selected, core)
      const inStory = inPlan ?? find(unselected, core)
      if (inStory) {
        quotesUsed += 1
        const evidenceIds = [qualifiedId(inStory.storyId, inStory.quote.id)]
        if (!inPlan) {
          add({ type: "quote-not-in-plan", severity: "warning", message: "A verified quote is used that the plan did not select.", segmentIndex, excerpt, evidenceIds })
        }
        if (!speakerMentioned(inStory.quote.speaker, segment.text)) {
          add({ type: "quote-speaker-missing", severity: "warning", message: `The quote is not attributed in its segment; its speaker is ${inStory.quote.speaker}.`, segmentIndex, excerpt, evidenceIds })
        }
        continue
      }

      const other = find(elsewhere, core)
      if (other) {
        add({
          type: "quote-wrong-story",
          severity: "error",
          message: "The quote is verified, but belongs to a story this segment does not tell (list that story's id in the segment).",
          segmentIndex,
          excerpt,
          evidenceIds: [qualifiedId(other.storyId, other.quote.id)],
        })
      } else if (countWords(span, language) >= MIN_UNVERIFIED_QUOTE_WORDS && isDirectSpeech(passage)) {
        add({ type: "quote-unverified", severity: "error", message: "Words in quotation marks match no verified quote: an invented or altered quote.", segmentIndex, excerpt })
      } else {
        // Short phrases, and single-quoted passages that are not introduced as speech (titles, names), are ambiguous.
        add({ type: "quoted-phrase", severity: "warning", message: "A phrase is in quotation marks but matches no verified quote; it may be a name or title, or altered speech.", segmentIndex, excerpt })
      }
    }
  })

  // The plan should hold the minimum evidence: these ceilings are guidelines, so going over is a warning, not a failure.
  for (const entry of plan.stories) {
    const over = [
      { count: entry.selectedFactIds.length, ceiling: MAX_PLANNED_FACTS, label: "facts" },
      { count: entry.selectedContextIds.length, ceiling: MAX_PLANNED_CONTEXT, label: "context items" },
      { count: entry.selectedAnalysisIds.length, ceiling: MAX_PLANNED_ANALYSIS, label: "analysis items" },
    ].filter(({ count, ceiling }) => count > ceiling)
    if (over.length > 0) {
      add({
        type: "plan-evidence-heavy",
        severity: "warning",
        message: `The plan selected more evidence than the editorial budget for "${entry.storyId}": ${over.map(({ count, label }) => `${count} ${label}`).join(", ")}.`,
      })
    }
  }

  // Old or hand-made research may still carry direct speech inside facts; it is not quotable, so flag it.
  for (const entry of plan.stories) {
    const indexed = known.get(entry.storyId)
    if (!indexed) continue
    const selectedClaims = [
      ...indexed.facts.filter(({ id }) => entry.selectedFactIds.includes(id)),
      ...indexed.context.filter(({ id }) => entry.selectedContextIds.includes(id)),
      ...indexed.analysis.filter(({ id }) => entry.selectedAnalysisIds.includes(id)),
    ].filter(({ claim }) => hasDirectSpeech(claim))
    if (selectedClaims.length > 0) {
      add({
        type: "evidence-contract",
        severity: "warning",
        message: "Selected facts, context or analysis contain direct speech in quotation marks; only quotes may be quoted.",
        evidenceIds: selectedClaims.map(({ id }) => qualifiedId(entry.storyId, id)),
      })
    }
  }

  return { issues, wordCount, storiesCovered: covered.size, quotesUsed }
}
