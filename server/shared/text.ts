/** Comparable form of text for a "is this quote really in the source" check: same words, ignoring typography. */
export function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(/[“”„«»‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/**
 * Single quotes ('...', ‘...’) only count as quotation marks when they wrap a passage: the opening one must not
 * follow a letter or digit and the closing one must not precede one, so apostrophes ("company's", "isn't",
 * "players' cars") never match. British-style reporting quotes speech with single quotes, so they matter.
 */
const SINGLE_QUOTED = /(?<![\p{L}\p{N}])['‘]((?:[^'‘’]|(?<=\p{L})['’](?=\p{L}))+?)['’](?![\p{L}\p{N}])/gu

/** How much text before a quotation mark is kept, to see whether a speech verb introduces it. */
const BEFORE_CHARS = 90

export interface QuotedPassage {
  /** What is between the quotation marks, trimmed. */
  text: string
  mark: "double" | "single"
  /** The text just before the opening mark. */
  before: string
}

/**
 * The passages inside quotation marks: double ("...", “...”, „...“, «...») and single ('...', ‘...’, when they wrap
 * a passage rather than mark an apostrophe), each with the text that comes just before it.
 */
export function quotedPassages(text: string): QuotedPassage[] {
  const passages: QuotedPassage[] = []
  let rest = text
  const take = (pattern: RegExp, mark: QuotedPassage["mark"]) => {
    rest = rest.replace(pattern, (match: string, inner: string, offset: number) => {
      const span = inner.trim()
      if (span) passages.push({ text: span, mark, before: text.slice(Math.max(0, offset - BEFORE_CHARS), offset) })
      // Same length, so the offsets of later matches still point into the original text.
      return " ".repeat(match.length)
    })
  }
  take(/„([^„“”]*)[“”]/g, "double")
  take(/“([^“”]*)”/g, "double")
  take(/«([^«»]*)»/g, "double")
  take(/"([^"]*)"/g, "double")
  take(SINGLE_QUOTED, "single")
  return passages
}

export function quotedSpans(text: string): string[] {
  return quotedPassages(text).map((passage) => passage.text)
}

/** Spoken words, counted per language (Japanese and Chinese have no spaces between words). */
export function countWords(text: string, language?: string): number {
  let count = 0
  for (const part of new Intl.Segmenter(language, { granularity: "word" }).segment(text)) {
    if (part.isWordLike) count += 1
  }
  return count
}

/**
 * A quoted passage of at least this many words can be direct speech. Shorter ones ("Gemini 3", a nickname)
 * are names and scare quotes, which are harmless.
 */
export const MIN_DIRECT_SPEECH_WORDS = 3

/**
 * A speech verb, then either anything short that does not end a sentence and a comma or colon right before the quote
 * (`said, '...'`, `told AFP: '...'`, `said, as quoted by the Globe and Mail, '...'`), or nothing but an optional
 * "that" (`Trump said his plan is safe and wrote '...'`). English only; other languages are never judged
 * confidently, which is safe because ambiguity is left to the validator.
 */
const SPEECH_INTRODUCTION =
  /\b(?:said|says|told|added|adds|wrote|writes|warned|warns|stated|states|explained|explains|noted|notes|posted|tweeted|claimed|argued|replied|insisted|declared|commented|responded)\b(?:[^.:;'"‘’“”]{0,60}[:,]|\s+that)?\s*$/iu

/**
 * Whether a quoted passage is confidently direct speech. A double-quoted passage of three or more words is taken as
 * speech. A single-quoted one is only speech when a speech verb introduces it: British reporting also single-quotes
 * titles, report names, event names and scare quotes, and those must not be mistaken for quotes. When in doubt the
 * answer is no: the evidence is kept and the validator handles the ambiguity.
 */
export function isDirectSpeech(passage: QuotedPassage): boolean {
  if (countWords(passage.text) < MIN_DIRECT_SPEECH_WORDS) return false
  return passage.mark === "double" || SPEECH_INTRODUCTION.test(passage.before)
}

/** True when a fact/context/analysis item confidently carries direct speech in quotation marks, which belongs only in `quotes`. */
export function hasDirectSpeech(claim: string): boolean {
  return quotedPassages(claim).some(isDirectSpeech)
}
