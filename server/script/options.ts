// Server-side copies of the podcast options the client offers (src/types/settings.ts,
// src/data/tones.ts, src/data/mockLanguages.ts). The server cannot use the client's `@/` alias, and
// keeping its own list means the API never depends on client code at runtime; options.test.ts fails
// if the two drift apart.

export const MIN_DURATION_MINUTES = 5
export const MAX_DURATION_MINUTES = 60
/** Approximate spoken pace used to turn a duration into a word target. */
export const WORDS_PER_MINUTE = 150

export const TONE_IDS = ["conversational", "informative", "storytelling", "reassuring", "journalistic", "humorous"] as const
export type ToneId = (typeof TONE_IDS)[number]

/** Language code -> name, so the model is told "Spanish" rather than "es". */
export const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Mandarin Chinese",
  hi: "Hindi",
  ar: "Arabic",
  ru: "Russian",
  sv: "Swedish",
} as const
export type LanguageCode = keyof typeof LANGUAGE_NAMES

export const LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES) as [LanguageCode, ...LanguageCode[]]

/** How far above the word target an episode may go. Going over is a hard validation error. */
export const WORD_TOLERANCE = 0.15
/** Below this share of the target an episode only gets a warning: duration is a target, not a minimum. */
export const MIN_WORDS_RATIO = 0.75

export function targetWordsFor(durationMinutes: number): number {
  return durationMinutes * WORDS_PER_MINUTE
}

/** The most words an episode may have. There is deliberately no hard floor: see MIN_WORDS_RATIO. */
export function maxWordsFor(durationMinutes: number): number {
  // Whole percentages, so the hard limit does not depend on floating-point rounding (750 x 1.15 is 862.4999...).
  return Math.round((targetWordsFor(durationMinutes) * Math.round((1 + WORD_TOLERANCE) * 100)) / 100)
}

/** The word count under which the script is flagged as short of its target (a warning only). */
export function minWordsFor(durationMinutes: number): number {
  return Math.round((targetWordsFor(durationMinutes) * Math.round(MIN_WORDS_RATIO * 100)) / 100)
}
