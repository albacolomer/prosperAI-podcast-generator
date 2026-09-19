import { z } from "zod"
import type { FetchNewsOptions } from "./service.js"

const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 60

const interestsSchema = z
  .string()
  .transform((value) => {
    const seen = new Set<string>()
    return value
      .split(",")
      .map((interest) => interest.trim())
      .filter((interest) => {
        const key = interest.toLowerCase()
        if (!interest || seen.has(key)) return false
        seen.add(key)
        return true
      })
  })
  .pipe(z.array(z.string().max(MAX_INTEREST_LENGTH)).min(1).max(MAX_INTERESTS))

const querySchema = z.object({
  interests: interestsSchema,
  language: z
    .string()
    .regex(/^[a-z]{2}$/, "must be a two-letter language code")
    .default("en"),
  days: z.coerce.number().int().min(1).max(14).default(3),
  debug: z.enum(["1", "true"]).optional(),
})

export type ParsedNewsQuery = { ok: true; options: FetchNewsOptions } | { ok: false; message: string }

/** Parses `?interests=A,B&language=en&days=3` from a request URL. */
export function parseNewsQuery(url: URL): ParsedNewsQuery {
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  const { interests, language, days, debug } = parsed.data
  return { ok: true, options: { interests, language, days, includeRemoved: debug !== undefined } }
}
