import { createHash } from "node:crypto"

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i

/** Collapses the many spellings of one link (tracking params, fragments, www, trailing slash) into one. */
export function canonicalizeUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  url.hash = ""
  url.hostname = url.hostname.replace(/^www\./, "")
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  url.pathname = url.pathname.replace(/\/+$/, "") || "/"
  return url.toString()
}

export function articleIdFromUrl(canonicalUrl: string): string {
  return createHash("sha1").update(canonicalUrl).digest("hex").slice(0, 16)
}

/** Strips markup and collapses whitespace in provider-supplied text. */
export function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Comparable form of a title: lowercase, no accents, no trailing " - Source", no punctuation. */
export function normalizeTitle(title: string, source: string): string {
  let text = title.toLowerCase()
  const suffix = /\s[-|–—]\s([^-|–—]+)$/.exec(text)
  if (suffix && suffix[1].trim() === source.toLowerCase().trim()) {
    text = text.slice(0, suffix.index)
  }
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
