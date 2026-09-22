export const ROUTES = {
  home: "/",
  episodes: "/episodes",
  dashboard: "/dashboard",
  newsDebug: "/news-debug",
  onboarding: "/onboarding",
} as const

export const STORAGE_KEYS = {
  interests: "prosperai.interests",
  settings: "prosperai.settings",
  generatedEpisodes: "prosperai.generatedEpisodes",
  episodeFeedback: "prosperai.episodeFeedback",
} as const
