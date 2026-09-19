const topicGradients: Record<string, string> = {
  "Artificial Intelligence": "linear-gradient(135deg, #6366f1 0%, #a855f7 55%, #ec4899 100%)",
  "Climate Tech": "linear-gradient(135deg, #16a34a 0%, #0d9488 55%, #0369a1 100%)",
  "Formula 1": "linear-gradient(135deg, #dc2626 0%, #ea580c 55%, #1e1b4b 100%)",
  "Space Exploration": "linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7e22ce 100%)",
  "Personal Finance": "linear-gradient(135deg, #0f766e 0%, #0369a1 55%, #1e3a8a 100%)",
  "Cryptocurrency": "linear-gradient(135deg, #f59e0b 0%, #ea580c 55%, #7c2d12 100%)",
  "Startups": "linear-gradient(135deg, #ec4899 0%, #8b5cf6 55%, #4338ca 100%)",
  "Health & Wellness": "linear-gradient(135deg, #059669 0%, #0891b2 55%, #0e7490 100%)",
}

const defaultGradient = "linear-gradient(135deg, #64748b 0%, #334155 55%, #0f172a 100%)"

export function gradientForTopic(topic: string | undefined): string {
  if (!topic) return defaultGradient
  return topicGradients[topic] ?? defaultGradient
}
