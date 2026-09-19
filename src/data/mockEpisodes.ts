import { gradientForTopic } from "@/data/topicGradients"
import type { Episode } from "@/types"

function daysAgoAt(daysAgo: number, hour: number, minute: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

interface EpisodeSeed extends Omit<Episode, "publishedAt" | "coverGradient"> {
  daysAgo: number
}

const episodeSeeds: EpisodeSeed[] = [
  {
    daysAgo: 0,
    id: "ep-012",
    title: "Inside the New Wave of Foundation Models",
    durationSeconds: 12 * 60,
    summary: "What the latest round of model releases means for builders and everyday users alike.",
    description:
      "A look at the newest foundation model releases, what's actually improved under the hood, and why the gap between frontier labs is narrowing faster than expected. We break down what it means for the apps you use every day.",
    topics: ["Artificial Intelligence", "Startups"],
    sources: [{ name: "TechCrunch" }, { name: "Ars Technica" }],
  },
  {
    daysAgo: 1,
    id: "ep-011",
    title: "F1's Budget Cap Battle: Who's Really Winning",
    durationSeconds: 15 * 60,
    summary: "A deep dive into how teams are stretching the budget cap rules — and which ones are winning the arms race off the track.",
    description:
      "The budget cap was supposed to level the playing field in Formula 1, but three seasons in, some teams have found the margins. We unpack the loopholes, the penalties handed out this year, and what it means for the championship fight.",
    topics: ["Formula 1"],
    sources: [{ name: "Reuters" }, { name: "Bloomberg" }],
  },
  {
    daysAgo: 2,
    id: "ep-010",
    title: "Carbon Capture Gets Real: Inside the New Plants",
    durationSeconds: 9 * 60,
    summary: "The first generation of commercial-scale carbon capture plants is finally online — here's what they're actually achieving.",
    description:
      "After a decade of pilot projects and skepticism, direct air capture is scaling up. We look at the economics behind the newest plants coming online, who's paying for the captured carbon, and whether the technology can hit the cost targets it needs to matter.",
    topics: ["Climate Tech"],
    sources: [{ name: "Reuters" }, { name: "Nature News" }],
  },
  {
    daysAgo: 3,
    id: "ep-009",
    title: "Interest Rates, Explained for Your Portfolio",
    durationSeconds: 22 * 60,
    summary: "What the latest rate moves actually mean for your savings, mortgage, and investments.",
    description:
      "Central banks have kept everyone guessing this year. We translate the latest policy moves into plain terms — what it means if you're holding cash, carrying a mortgage, or sitting on a stock portfolio — and what to watch for next quarter.",
    topics: ["Personal Finance"],
    sources: [{ name: "Bloomberg" }, { name: "Reuters" }],
  },
  {
    daysAgo: 5,
    id: "ep-008",
    title: "Special: A Year in Space — Missions, Milestones and What's Next",
    durationSeconds: 55 * 60,
    summary: "Our longest episode yet: a full recap of the year's biggest space missions and a look ahead to what's launching next.",
    description:
      "From lunar landers to the newest exoplanet surveys, this extended special walks through every major space milestone of the year, the missions that slipped their timelines, and the launches worth marking on your calendar for next year.",
    topics: ["Space Exploration"],
    sources: [{ name: "Ars Technica" }, { name: "Nature News" }, { name: "Reuters" }],
  },
  {
    daysAgo: 6,
    id: "ep-007",
    title: "Stablecoins Under the Microscope",
    durationSeconds: 11 * 60,
    summary: "Regulators are finally writing real rules for stablecoins — what changes for holders and issuers.",
    description:
      "New reserve and disclosure requirements are reshaping how stablecoins operate. We cover what's actually required now, which issuers are affected first, and whether this settles the debate over how 'stable' these coins really are.",
    topics: ["Cryptocurrency"],
    sources: [{ name: "Bloomberg" }, { name: "TechCrunch" }],
  },
  {
    daysAgo: 7,
    id: "ep-006",
    title: "The Startups Betting Against Big Tech",
    durationSeconds: 18 * 60,
    summary: "Meet the founders building smaller, focused AI tools instead of chasing the big platforms.",
    description:
      "Not every founder wants to compete with the frontier labs. We talk to a handful of startups making a deliberate bet on narrow, specialized AI products — and look at whether that positioning actually holds up as the big players expand.",
    topics: ["Startups", "Artificial Intelligence"],
    sources: [{ name: "TechCrunch" }, { name: "The Verge" }],
  },
  {
    daysAgo: 8,
    id: "ep-005",
    title: "F1 Goes Electric? The Next-Gen Power Unit Debate",
    durationSeconds: 14 * 60,
    summary: "The next engine regulations are dividing the grid — we break down what's actually changing.",
    description:
      "Manufacturers are split over the next generation of power units, with some pushing for more electrification and others warning about cost and sound. We explain the technical tradeoffs and why this fight matters beyond the track.",
    topics: ["Formula 1", "Climate Tech"],
    sources: [{ name: "The Verge" }, { name: "Reuters" }],
  },
  {
    daysAgo: 9,
    id: "ep-004",
    title: "The New Sleep Science Everyone's Talking About",
    durationSeconds: 10 * 60,
    summary: "New research is upending some long-held assumptions about sleep tracking and recovery.",
    description:
      "A wave of new studies is challenging popular assumptions about sleep stages, recovery, and what wearables actually measure. We break down what the science supports, what's still marketing, and what's worth changing in your routine.",
    topics: ["Health & Wellness"],
    sources: [{ name: "Nature News" }, { name: "TechCrunch" }],
  },
  {
    daysAgo: 12,
    id: "ep-003",
    title: "Why Everyone's Rethinking Retirement Savings",
    durationSeconds: 25 * 60,
    summary: "Longer lifespans and shifting markets are forcing a rethink of the classic retirement playbook.",
    description:
      "The old rules of thumb for retirement savings are getting a second look. We walk through what's changed, how advisors are adjusting their guidance, and the tradeoffs behind a few popular alternative strategies.",
    topics: ["Personal Finance"],
    sources: [{ name: "Bloomberg" }, { name: "Reuters" }],
  },
  {
    daysAgo: 13,
    id: "ep-002",
    title: "The Next Moon Landing: Who's Actually Ready?",
    durationSeconds: 13 * 60,
    summary: "Several teams say they're close to a crewed lunar landing — here's how their timelines actually compare.",
    description:
      "With multiple programs racing toward a crewed lunar landing, we compare the real state of each effort: hardware that's flown, tests still pending, and the schedule risks nobody's saying out loud.",
    topics: ["Space Exploration"],
    sources: [{ name: "Ars Technica" }, { name: "Reuters" }],
  },
  {
    daysAgo: 14,
    id: "ep-001",
    title: "Climate Tech's Funding Winter Is Thawing",
    durationSeconds: 8 * 60,
    summary: "After two rough years, climate tech startups are seeing fresh investor interest — but not for every category.",
    description:
      "Venture funding for climate startups is picking back up, but unevenly. We look at which categories are attracting capital again, which are still stuck, and what's driving the shift in investor appetite.",
    topics: ["Climate Tech", "Startups"],
    sources: [{ name: "TechCrunch" }, { name: "Bloomberg" }],
  },
]

export const mockEpisodes: Episode[] = episodeSeeds
  .map(({ daysAgo, ...episode }) => ({
    ...episode,
    publishedAt: daysAgoAt(daysAgo, 8, 0),
    coverGradient: gradientForTopic(episode.topics[0]),
  }))
  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
