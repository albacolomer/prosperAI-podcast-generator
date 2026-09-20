import { headlineOverlap } from "./text.js"

export const MIN_CONTENT_CHARS = 600
/**
 * Paywall prompts and trailing ellipses only condemn short pages. A long page often carries a subscribe banner,
 * a "Read more" widget or a "Please wait..." comment box after a complete article.
 */
const SHORT_PAGE_CHARS = 4000
/** Real sentences, as opposed to menu items and link labels, are longer than this. */
const PROSE_LINE_CHARS = 80
/**
 * How much running text a page needs. This is an amount, not a share: a press release inside a page with a big
 * navigation menu is still a press release.
 */
const MIN_PROSE_CHARS = 600
const MIN_HEADLINE_OVERLAP = 0.25

const PAYWALL_PATTERNS = [
  /subscribe to (continue|read|unlock)/i,
  /(sign|log) ?in to (continue|read|view)/i,
  /to continue reading/i,
  /(create|register)( a)?( free)? (account|profile) to (continue|read)/i,
  /(available|reserved|exclusive) (only )?(to|for) (paid )?(subscribers|members)/i,
  /already a subscriber/i,
  /you('ve| have) reached your (free )?(article )?limit/i,
]
/** Truncation markers that are unambiguous on a page of any length (NewsAPI-style "[+1234 chars]"). */
const CUT_OFF_MARKER = /\[\+\d+ chars\]\s*$/i
/** On a short page, a trailing ellipsis or "Read more" means a teaser. */
const TEASER_MARKERS = [/(…|\.\.\.)\s*$/, /(read more|continue reading)[^\n]{0,40}$/i]

export interface ContentValidation {
  usable: boolean
  /** Human-readable problems; empty when the content is usable. */
  issues: string[]
}

/**
 * Lightweight checks on what an extraction returned. A 200 response does not mean a good article:
 * this catches the common failure shapes (stub, paywall, cut-off, page chrome, wrong page), not every one.
 * It leans towards accepting a page: synthesis is conservative and quotes are verified, so a slightly messy
 * source costs little, while a wrongly rejected primary source can cost the story.
 */
export function validateContent(content: string, headline: string): ContentValidation {
  const text = content.trim()
  const issues: string[] = []
  const short = text.length < SHORT_PAGE_CHARS

  if (text.length < MIN_CONTENT_CHARS) issues.push(`too short (${text.length} characters)`)
  if (short && PAYWALL_PATTERNS.some((pattern) => pattern.test(text))) issues.push("looks paywalled")
  if (CUT_OFF_MARKER.test(text) || (short && TEASER_MARKERS.some((pattern) => pattern.test(text)))) {
    issues.push("looks truncated")
  }

  if (text.length >= MIN_CONTENT_CHARS) {
    const proseChars = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length >= PROSE_LINE_CHARS)
      .reduce((sum, line) => sum + line.length, 0)
    if (proseChars < MIN_PROSE_CHARS) issues.push("mostly navigation or page chrome")
    if (headlineOverlap(headline, text) < MIN_HEADLINE_OVERLAP) issues.push("does not appear to be about this story")
  }

  return { usable: issues.length === 0, issues }
}
