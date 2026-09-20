import type { Tone } from "@/types"

export interface ToneOption {
  id: Tone
  label: string
  description: string
}

export const tones: ToneOption[] = [
  {
    id: "conversational",
    label: "Conversational / Informal",
    description: "Friendly, relaxed, and natural — like chatting with a smart friend.",
  },
  {
    id: "informative",
    label: "Informative / Educational",
    description: "Clear, confident, and explanatory, with a focus on making complex topics easy to understand.",
  },
  {
    id: "storytelling",
    label: "Storytelling",
    description: "Human, expressive, and narrative, using pacing and curiosity to pull listeners in.",
  },
  {
    id: "reassuring",
    label: "Reassuring / Intimate",
    description: "Warm, thoughtful, and personal, creating a calm and genuine listening experience.",
  },
  {
    id: "journalistic",
    label: "Journalistic / Formal",
    description: "Serious, structured, objective, and professional.",
  },
  {
    id: "humorous",
    label: "Humorous / Entertaining",
    description: "Witty, playful, and energetic, with light humor and personality.",
  },
]
