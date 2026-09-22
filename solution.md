# Solution Overview: Personalized AI News Podcast

## The product

Users pick the topics they care about, a tone (conversational, journalistic, storytelling, humorous…) and a delivery schedule. The app turns that into a ~9-minute audio episode: it finds the relevant news, researches each story against real sources, writes a script based only on verified evidence, checks it, and converts it to audio. Episodes are listed in the app and can be played directly in the browser.

The core product challenge is **trust**. A news podcast that invents a fact or a quote is worse than no podcast at all, so most of the architecture exists to make the script factually safe by design.

## How an episode is generated

| Step | What it does | Tech |
|---|---|---|
| 1. News | Fetches articles for each interest, cleans and deduplicates them | GNews |
| 2. Ranking | Picks the most relevant, significant and diverse stories | GPT-5-mini |
| 3. Research | Searches and extracts source text; builds facts, context and quotes, each linked to its source | Tavily + GPT-5-mini |
| 4. Planning | Decides stories, order, evidence and word budget per segment | GPT-5-mini |
| 5. Writing | Turns the approved plan into a spoken script | GPT-5.5 (medium reasoning) |
| 6. Validation | Code checks + AI review; blocks the script on factual errors | Code + GPT-5-mini |
| 7. Audio | Text-to-speech; MP3 stored with the episode metadata | ElevenLabs |

Every stage is implemented end-to-end; nothing in the pipeline is stubbed. The stronger model is used only for writing, where quality is most noticeable to the listener; the other steps use the cheaper GPT-5-mini. All models can be changed through environment variables.

## Key decisions

**1. A staged pipeline instead of one big prompt.** Each stage has a single job, its own validated input and output, and can be tested and improved on its own. Ranking knows nothing about scripts; research knows nothing about audio. When quality drops, I can tell which stage caused it.

**2. Factuality by construction.** The writer never sees raw search results. It only receives evidence that research has verified (quotes must match the source text word for word) and that the planner has selected, each referenced by ID. It has no way to use material that wasn't approved. When sources disagree, the disagreement is kept and reported, not smoothed over.

**3. Plan first, then write.** The planner commits to the structure before any prose exists: which stories, in what order, which facts, how many words each. Links between stories are only allowed when they share a concrete fact or entity in the evidence. The writer's job is reduced to turning approved material into good audio copy.

**4. Never trust model output directly.** Every LLM call uses strict JSON-schema output, and everything is then re-validated in code (Zod plus semantic checks). IDs, rankings and counts are re-derived on the server instead of being taken from the model.

**5. A validator that can't block on guesses.** Objective checks (word count, quote verification, formatting, language) run in plain code. An AI reviewer catches unsupported claims or wrong attributions, but it can only block a script if the passage it flags actually appears in the script; otherwise the issue becomes a warning. Style issues never block. If validation fails, the writer gets one retry with the same plan and only the blocking errors as feedback.

**6. A modular monolith, serverless-shaped.** One repo and one deployable: a React app plus thin API handlers that call framework-agnostic server modules. The same handler code runs locally and in a Vercel-style deployment. External providers sit behind interfaces or config (e.g. a `NewsProvider` interface for news sources), so they can be swapped without touching the pipeline. Microservices would add operational cost without solving any problem this system has.

**7. Fixed 9-minute episodes.** A deliberate scope cut. It removes a whole tuning dimension (word budgets, validation thresholds) and keeps every script under the ElevenLabs character limit, so audio generation is one simple request, guaranteed by a length check before the call.

**8. Honest mocks where real data doesn't exist yet.** The first podcast in onboarding is simulated, because a real run takes minutes and that's a poor first experience. The analytics dashboard runs on a deterministic mock dataset, clearly labeled "Mock data" in the UI, behind a single `getAnalyticsData()` function, so a real backend can replace it without changing the UI.

## What's real vs. simplified

| Area | Status |
|---|---|
| Generation pipeline (news → audio) | Real, end-to-end |
| Episode storage and playback | Real, file-based (MP3 + JSON per episode); no database |
| Scheduling | Logic is complete and tested (due times, locking, retries); the automatic trigger only runs in the local dev server |
| Episode duration | Fixed at 9 minutes |
| Onboarding first podcast | Simulated |
| Analytics dashboard | Mock data |

## Path to production

The current design already anticipates these steps, so they are additions rather than rewrites:

- **Scheduling:** an external trigger (e.g. Vercel Cron) calling the existing scheduling logic, which doesn't need to change.
- **Queue and workers:** a full episode takes minutes, too long for a single serverless request.
- **Storage:** Postgres for episodes and schedules, S3 (or similar) for audio files.
- **Shared research cache:** many users follow the same stories, so researching each story once is the biggest cost saving.
- **Observability and limits:** send the per-stage stats the pipeline already tracks to real metrics, and add per-user generation limits.

## Tech stack

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts
**Backend:** TypeScript serverless-style handlers (Vercel), Zod
**AI and data:** OpenAI (GPT-5.5 for writing, GPT-5-mini elsewhere), Tavily, GNews, ElevenLabs
**Testing:** Vitest, Testing Library
