const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "has", "have", "had", "will", "its",
  "into", "over", "after", "about", "than", "then", "they", "their", "been", "more", "new", "says", "said", "how",
  "why", "what", "who", "not", "but", "can", "could", "would", "may", "his", "her", "out", "all", "you", "your",
])

/** Lowercase, accent-free words worth comparing (no stopwords, at least three characters). */
export function significantTokens(text: string): Set<string> {
  const words = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[\p{L}\p{N}]+/gu) ?? []
  return new Set(words.filter((word) => word.length >= 3 && !STOPWORDS.has(word)))
}

/** Share of the headline's significant words that also appear in `text` (1 when the headline has none). */
export function headlineOverlap(headline: string, text: string): number {
  const wanted = significantTokens(headline)
  if (wanted.size === 0) return 1
  const available = significantTokens(text)
  let found = 0
  for (const token of wanted) if (available.has(token)) found += 1
  return found / wanted.size
}
