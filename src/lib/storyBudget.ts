/** Story-count budget: roughly one story per 1.5 minutes of episode, kept within a sane range. Shared by the debug page and the server's episode pipeline. */
const MINUTES_PER_STORY = 1.5
const MIN_STORIES = 3
const MAX_STORIES = 12

export function storiesForDuration(durationMinutes: number): number {
  const stories = Math.round(durationMinutes / MINUTES_PER_STORY)
  return Math.min(MAX_STORIES, Math.max(MIN_STORIES, stories))
}
