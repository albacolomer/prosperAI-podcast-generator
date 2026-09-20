import { generateAudio } from "../audio/audio.js"
import { createElevenLabsClient, modelIdFrom } from "../audio/elevenlabs.js"
import { GNewsProvider } from "../news/providers/gnews.js"
import { createNewsService } from "../news/service.js"
import { createOpenAiRankModel, DEFAULT_RANKING_MODEL } from "../ranking/openai.js"
import { rankStories } from "../ranking/ranker.js"
import { createOpenAiResearchModel, DEFAULT_RESEARCH_MODEL } from "../research/openai.js"
import { researchStories } from "../research/researcher.js"
import { createTavilyClient } from "../research/tavily.js"
import { generateEpisode } from "../script/episode.js"
import {
  createOpenAiPlannerModel,
  createOpenAiReviewModel,
  createOpenAiScriptModel,
  DEFAULT_PLANNER_MODEL,
  DEFAULT_REVIEW_MODEL,
  DEFAULT_SCRIPT_MODEL,
} from "../script/openai.js"
import type { PipelineDeps } from "./pipeline.js"
import { createEpisodeStore } from "./storage.js"

/** Everything the pipeline needs from the environment. The voice is here, on the server, and nowhere in a request. */
export const REQUIRED_ENV = ["GNEWS_API_KEY", "OPENAI_API_KEY", "TAVILY_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"] as const

export function missingEnv(env: NodeJS.ProcessEnv): string[] {
  return REQUIRED_ENV.filter((name) => !env[name])
}

// Created once per server instance so the news service's in-memory cache survives across requests.
let newsService: ReturnType<typeof createNewsService> | undefined

/** The run-independent part of the pipeline: the same services the individual /api endpoints build, configured from env. */
export type PipelineServices = Omit<PipelineDeps, "onProgress" | "signal" | "log" | "clock">

/**
 * Wires the existing stage services exactly as their own endpoints do (same factories, same per-stage model settings).
 * Call only after missingEnv() is empty.
 */
export function createPipelineServices(env: NodeJS.ProcessEnv): PipelineServices {
  const gnewsKey = env.GNEWS_API_KEY as string
  const openAiKey = env.OPENAI_API_KEY as string
  const tavilyKey = env.TAVILY_API_KEY as string
  const elevenLabsKey = env.ELEVENLABS_API_KEY as string

  newsService ??= createNewsService({ providers: [new GNewsProvider(gnewsKey)] })

  const rankingModel = env.OPENAI_RANKING_MODEL || DEFAULT_RANKING_MODEL
  const researchModel = env.OPENAI_RESEARCH_MODEL || DEFAULT_RESEARCH_MODEL
  const scriptModel = env.OPENAI_SCRIPT_MODEL || DEFAULT_SCRIPT_MODEL
  const plannerModel = env.OPENAI_PLANNER_MODEL || DEFAULT_PLANNER_MODEL
  const reviewModel = env.OPENAI_VALIDATOR_MODEL || DEFAULT_REVIEW_MODEL

  return {
    news: newsService,
    rank: (input) => rankStories(input, { model: createOpenAiRankModel({ apiKey: openAiKey, modelName: rankingModel }), modelName: rankingModel }),
    research: (articles) =>
      researchStories(
        { articles },
        {
          tavily: createTavilyClient({ apiKey: tavilyKey }),
          model: createOpenAiResearchModel({ apiKey: openAiKey, modelName: researchModel }),
          modelName: researchModel,
        },
      ),
    script: (input, progress, retry) => {
      const planner = createOpenAiPlannerModel({ apiKey: openAiKey, modelName: plannerModel })
      const writer = createOpenAiScriptModel({ apiKey: openAiKey, modelName: scriptModel })
      return generateEpisode(
        input,
        {
          planner: { model: planner, modelName: plannerModel },
          // The stages are unchanged. The writer only runs once the plan has been accepted, so wrapping its model call is how
          // the pipeline learns that planning is over (the planner itself validates its plan after its model call returns).
          writer: {
            model: async (prompt) => {
              progress.planned()
              const answer = await writer(prompt)
              progress.written()
              return answer
            },
            modelName: scriptModel,
          },
          reviewer: { model: createOpenAiReviewModel({ apiKey: openAiKey, modelName: reviewModel }), modelName: reviewModel },
        },
        retry,
      )
    },
    voice: (script) =>
      generateAudio(script, {
        client: createElevenLabsClient({ apiKey: elevenLabsKey }),
        voiceId: env.ELEVENLABS_VOICE_ID,
        modelId: modelIdFrom(env),
      }),
    store: createEpisodeStore(),
  }
}
