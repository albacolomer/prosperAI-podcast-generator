/** Every podcast's cover uses this same gradient, regardless of topic. */
const coverGradient = "linear-gradient(135deg, #64748b 0%, #334155 55%, #0f172a 100%)"

export function gradientForTopic(): string {
  return coverGradient
}
