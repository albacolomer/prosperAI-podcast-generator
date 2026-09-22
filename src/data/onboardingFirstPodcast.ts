import { gradientForTopic } from "@/data/topicGradients"
import { mockLanguages } from "@/data/mockLanguages"
import { tones } from "@/data/tones"
import type { OnboardingAnswers } from "@/types/onboarding"
import type { Episode } from "@/types"

/** Short, headline-friendly word for each onboarding interest, used to build the mock episode title. */
const titleFragments: Record<string, string> = {
  "AI & Technology": "AI",
  "Startups": "Startups",
  "Business": "Business",
  "Science": "Science",
  "Finance": "Markets",
  "Economics": "the Economy",
  "World News": "the World",
  "Climate": "Climate",
  "Health": "Health",
  "Culture": "Culture",
  "Sports": "Sports",
  "Travel": "Travel",
  "Design": "Design",
  "Productivity": "Productivity",
  "Entertainment": "Entertainment",
  "Gaming": "Gaming",
}

function buildTitle(interests: string[]): string {
  const words = interests.map((interest) => titleFragments[interest] ?? interest)
  if (words.length === 0) return "Your First ProsperPod"
  if (words.length === 1) return `${words[0]}: The Stories Shaping Today`
  if (words.length === 2) return `${words[0]} & ${words[1]}: What's Shaping Today`
  const last = words[words.length - 1]
  return `${words.slice(0, -1).join(", ")} & ${last}: The Stories Shaping Tomorrow`
}

function buildSummary(interests: string[], toneLabel: string): string {
  const topicList = interests.length > 1 ? `${interests.slice(0, -1).join(", ")} and ${interests[interests.length - 1]}` : interests[0]
  return `A ${toneLabel.toLowerCase()} look at today's biggest stories in ${topicList ?? "the topics you picked"}, built from what you told us during setup.`
}

function buildDescription(interests: string[], toneLabel: string, languageLabel: string): string {
  return `Your first ProsperPod, tailored to ${interests.join(", ")}. Delivered in a ${toneLabel.toLowerCase()} style, in ${languageLabel}, so it sounds like it was made for you — because it was.`
}

/** Builds a deterministic mock episode from the onboarding answers. No script, research or audio pipeline is involved. */
export function buildFirstPodcastEpisode(answers: OnboardingAnswers): Episode {
  const tone = tones.find((option) => option.id === answers.tone) ?? tones[0]
  const language = mockLanguages.find((option) => option.code === answers.language) ?? mockLanguages[0]

  return {
    id: "onboarding-first-episode",
    title: buildTitle(answers.interests),
    publishedAt: new Date().toISOString(),
    durationSeconds: answers.duration * 60,
    summary: buildSummary(answers.interests, tone.label),
    description: buildDescription(answers.interests, tone.label, language.label),
    topics: answers.interests,
    sources: [{ name: "Handpicked from the topics you chose" }],
    coverGradient: gradientForTopic(),
  }
}
