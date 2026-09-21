// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { seedInterests } from "@/data/seedInterests"
import { tones } from "@/data/tones"
import { STORAGE_KEYS } from "@/lib/constants"
import { configuredSchedule, generatedEpisode, installDomPolyfills, installFakeApi } from "@/test/dom"
import type { ScheduleRunStatus } from "@/types"
import { HomePage } from "./HomePage"

vi.setConfig({ testTimeout: 20_000 })

const ALL_INTERESTS = seedInterests.map((interest) => interest.label)
const WAITING = "Working on your new podcast, it will be ready soon."
const GENERATING = "Generating your new podcast, this may take a few minutes."
/** What the pipeline calls its stages. None of these may reach the Home page. */
const STAGE_WORDS = /Finding stories|Researching|Planning episode|Writing script|Checking script|Generating audio|Ranking|Validation/i

const run = (overrides: Partial<ScheduleRunStatus> = {}): ScheduleRunStatus => ({
  status: "completed",
  deliveryAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  timeZone: "Europe/Madrid",
  attempts: 1,
  startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
  finishedAt: new Date(Date.now() - 16 * 60_000).toISOString(),
  late: false,
  ...overrides,
})

function renderHome() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <HomePage />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

/** The Podcast settings card, opened. */
async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  const toggle = await screen.findByRole("button", { name: /Podcast settings/i })
  await user.click(toggle)
  return toggle.parentElement as HTMLElement
}

/** A select's trigger, found by the value it shows (a combobox has no accessible name of its own from its content). */
const selectShowing = (root: HTMLElement, value: string) => {
  const trigger = within(root).getAllByRole("combobox").find((element) => element.textContent === value)
  if (!trigger) throw new Error(`No select shows "${value}"`)
  return trigger
}

const generateButton = () => screen.getByRole("button", { name: /Generate new podcast|Generating/ })
const weekdayState = () => screen.getAllByRole("radio").map((radio) => [radio.getAttribute("aria-label"), radio.getAttribute("aria-checked") === "true"] as const)
const chosenWeekdays = () => weekdayState().filter(([, chosen]) => chosen).map(([name]) => name)

beforeEach(() => {
  installDomPolyfills()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the primary action area", () => {
  it("says 'Generate new podcast'", async () => {
    installFakeApi()
    renderHome()

    expect(generateButton().textContent).toBe("Generate new podcast")
    expect(document.body.textContent).not.toMatch(/Generate new episode/i)
  })

  it("shows the active schedule summary directly below the Generate button, once", async () => {
    installFakeApi(configuredSchedule({ enabled: true, interests: ALL_INTERESTS, nextDeliveryAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString() }))
    const user = userEvent.setup()
    renderHome()

    const summary = await screen.findByTestId("schedule-summary")
    expect(generateButton().compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Same block as the button, not somewhere further down the page.
    expect(generateButton().closest("div[class*='flex-col']")?.contains(summary)).toBe(true)
    expect(summary.textContent).toContain("Schedule active · Every day")
    expect(summary.textContent).toMatch(/Next episode: (Today|Tomorrow), \d{1,2}:\d{2} [AP]M/)

    // Only once: the settings do not repeat it, even open.
    const settings = await openSettings(user)
    expect(screen.getAllByTestId("schedule-summary")).toHaveLength(1)
    expect(within(settings).queryByText(/Schedule active|Next episode/)).toBeNull()
  })

  it("shows no summary when the schedule is off", async () => {
    const api = installFakeApi(configuredSchedule({ enabled: false, interests: ALL_INTERESTS }))
    renderHome()

    await waitFor(() => expect(api.calls).toContain("GET /api/schedule"))
    await waitFor(() => expect(api.calls).toContain("GET /api/episodes"))
    expect(screen.queryByTestId("schedule-summary")).toBeNull()
    expect(document.body.textContent).not.toMatch(/Schedule active|Schedule off|Next episode/)
  })

  it("shows a paused state, not an active one, when the schedule has lost its interests", async () => {
    // This browser has none selected either, so there is nothing to sync that would resume it.
    localStorage.setItem(STORAGE_KEYS.interests, JSON.stringify(seedInterests.map((interest) => ({ ...interest, selected: false }))))
    installFakeApi(configuredSchedule({ enabled: true, interests: [], paused: "no-interests", nextDeliveryAt: null }))
    renderHome()

    const summary = await screen.findByTestId("schedule-summary")
    expect(summary.getAttribute("data-state")).toBe("paused")
    expect(summary.textContent).toContain("Schedule paused")
    expect(document.body.textContent).not.toContain("Schedule active")
  })
})

describe("Podcast settings", () => {
  it("starts collapsed, and opens and closes on request", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderHome()

    const toggle = screen.getByRole("button", { name: /Podcast settings/i })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    for (const label of ["Language", "Tone", "Schedule episodes", "Save changes"]) expect(screen.queryByText(label)).toBeNull()

    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    for (const label of ["Language", "Tone", "Schedule episodes", "Save changes"]) expect(screen.getByText(label)).toBeTruthy()

    await user.click(toggle)
    expect(screen.queryByText("Tone")).toBeNull()
  })

  it("has no Duration", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderHome()
    const settings = await openSettings(user)

    expect(within(settings).queryByText(/Duration/i)).toBeNull()
    expect(within(settings).queryByText(/10 minutes/i)).toBeNull()
  })

  it("shows a tone's description only while the selector is open", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderHome()
    const settings = await openSettings(user)

    const [conversational, , storytelling] = tones
    const trigger = selectShowing(settings, conversational.label)
    // Closed: only the chosen tone, no description, for any tone.
    expect(within(settings).getByText(conversational.label)).toBeTruthy()
    for (const tone of tones) expect(screen.queryByText(tone.description)).toBeNull()

    // Open: every tone with its description.
    await user.click(trigger)
    for (const tone of tones) {
      expect(await screen.findByText(tone.description)).toBeTruthy()
      expect(screen.getByRole("option", { name: new RegExp(tone.label.replace(/[/]/g, "\\/")) })).toBeTruthy()
    }

    // Choose one: the list closes, the descriptions go, the trigger shows just the new tone.
    await user.click(screen.getByRole("option", { name: new RegExp(storytelling.label) }))
    await waitFor(() => expect(screen.queryByText(storytelling.description)).toBeNull())
    for (const tone of tones) expect(screen.queryByText(tone.description)).toBeNull()
    expect(selectShowing(settings, storytelling.label).textContent).toBe(storytelling.label)
  })

  it("hides every schedule field while the toggle is off, and reveals them when it is on", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderHome()
    const settings = await openSettings(user)

    const toggle = within(settings).getByRole("switch")
    expect(toggle.getAttribute("aria-checked")).toBe("false")
    for (const label of ["Frequency", "Delivery time", "Delivered on", "Day of the month"]) expect(within(settings).queryByText(label)).toBeNull()
    expect(within(settings).queryByText(/Generate one automatically|delivery time is when|try once more|Schedule active|Schedule off/)).toBeNull()

    await user.click(toggle)
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    expect(within(settings).getByText("Frequency")).toBeTruthy()
    expect(within(settings).getByText("Delivery time")).toBeTruthy()

    await user.click(toggle)
    expect(within(settings).queryByText("Frequency")).toBeNull()
  })
})

describe("the scheduled podcast", () => {
  it("shows a light message while it is being generated, and removes it once it is ready", async () => {
    const api = installFakeApi(configuredSchedule({ enabled: true, interests: ALL_INTERESTS, run: run({ status: "running", finishedAt: undefined }) }))
    renderHome()

    expect(await screen.findByText(WAITING)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(STAGE_WORDS)

    // The scheduler finishes; the next check of the schedule no longer shows the message.
    api.schedule = configuredSchedule({ enabled: true, interests: ALL_INTERESTS, run: run() })
    document.dispatchEvent(new Event("visibilitychange"))
    await waitFor(() => expect(screen.queryByText(WAITING)).toBeNull())
  })

  it("does not say a finished podcast was late", async () => {
    const api = installFakeApi(configuredSchedule({ enabled: true, interests: ALL_INTERESTS, run: run({ late: true }) }))
    renderHome()

    await waitFor(() => expect(api.calls).toContain("GET /api/schedule"))
    await screen.findByTestId("schedule-summary").catch(() => undefined)
    expect(screen.queryByTestId("scheduled-run-banner")).toBeNull()
    expect(document.body.textContent).not.toMatch(/arrived late|was due at|was ready at/i)
  })

  it("still shows a useful failure once the retries are used up", async () => {
    installFakeApi(
      configuredSchedule({
        enabled: true,
        interests: ALL_INTERESTS,
        run: run({ status: "failed", attempts: 2, finishedAt: new Date().toISOString(), message: "We couldn't validate this episode reliably." }),
      }),
    )
    renderHome()

    const banner = await screen.findByTestId("scheduled-run-banner")
    expect(banner.getAttribute("data-kind")).toBe("failed")
    expect(banner.textContent).toContain("We couldn't generate your scheduled podcast")
    expect(banner.textContent).toContain("We couldn't validate this episode reliably. We tried twice.")
    expect(banner.textContent).not.toMatch(/stack|OpenAI|ElevenLabs|Tavily/i)
  })
})

describe("generating a podcast", () => {
  it("shows one simple message, disables the button, and hides every stage of the pipeline", async () => {
    const api = installFakeApi()
    const user = userEvent.setup()
    renderHome()

    await user.click(generateButton())
    expect(await screen.findByText(GENERATING)).toBeTruthy()
    expect(generateButton().hasAttribute("disabled")).toBe(true)

    // The server reports every stage; none of it is shown.
    for (const stage of ["news", "ranking", "research", "planning", "writing", "checking", "audio"]) {
      api.generation.send({ type: "progress", stage, status: "started" })
      api.generation.send({ type: "progress", stage, status: "done" })
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByText(GENERATING)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(STAGE_WORDS)
    const status = screen.getByRole("status")
    expect(within(status).queryAllByRole("listitem")).toHaveLength(0)
    expect(status.textContent).toBe(GENERATING)

    // Pressing it again while it works does nothing.
    await user.click(generateButton())
    expect(api.generationRequests).toHaveLength(1)
  })

  it("sends only the user's settings", async () => {
    const api = installFakeApi()
    const user = userEvent.setup()
    renderHome()

    await user.click(generateButton())
    await waitFor(() => expect(api.generationRequests).toHaveLength(1))
    expect(api.generationRequests[0]).toEqual({ interests: ALL_INTERESTS, language: "en", tone: "conversational" })
  })

  it("moves on to the new podcast when it is ready", async () => {
    const api = installFakeApi()
    const user = userEvent.setup()
    renderHome()

    await user.click(generateButton())
    await screen.findByText(GENERATING)
    api.generation.send({ type: "result", episode: generatedEpisode, stats: {} })
    api.generation.close()

    await waitFor(() => expect(screen.queryByText(GENERATING)).toBeNull())
    expect(await screen.findByRole("heading", { name: generatedEpisode.title })).toBeTruthy()
    expect(generateButton().textContent).toBe("Generate new podcast")
    expect(generateButton().hasAttribute("disabled")).toBe(false)
  })

  it("shows a clear error, without internals, when it fails", async () => {
    const api = installFakeApi()
    const user = userEvent.setup()
    renderHome()

    await user.click(generateButton())
    await screen.findByText(GENERATING)
    api.generation.send({ type: "error", stage: "audio", message: "We couldn't turn the script into audio. Please try again." })
    api.generation.close()

    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("We couldn't create your podcast")
    expect(alert.textContent).toContain("We couldn't turn the script into audio. Please try again.")
    expect(screen.queryByText(GENERATING)).toBeNull()
    expect(generateButton().hasAttribute("disabled")).toBe(false)
  })
})

describe("the weekly day", () => {
  /** Turns the schedule on and picks Weekly, through the controls. */
  async function chooseWeekly(user: ReturnType<typeof userEvent.setup>, settings: HTMLElement) {
    await user.click(within(settings).getByRole("switch"))
    await user.click(selectShowing(settings, "Daily"))
    await user.click(await screen.findByRole("option", { name: "Weekly" }))
    await screen.findByText("Delivered on")
  }

  it("chooses exactly the day that is clicked, and changes to another at once", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderHome()
    const settings = await openSettings(user)
    await chooseWeekly(user, settings)

    expect(weekdayState().map(([name]) => name)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])

    await user.click(screen.getByRole("radio", { name: "Friday" }))
    expect(chosenWeekdays()).toEqual(["Friday"])
    expect(screen.getByRole("radio", { name: "Friday" }).getAttribute("data-state")).toBe("on")
    // ...and the chosen one is filled with the accent colour, not the grey the panel and the hover share.
    const filled = screen.getByRole("radio", { name: "Friday" }).className
    expect(filled).toContain("data-[state=on]:bg-primary")
    expect(filled).not.toContain("data-[state=on]:bg-muted")

    await user.click(screen.getByRole("radio", { name: "Wednesday" }))
    expect(chosenWeekdays()).toEqual(["Wednesday"])
    expect(screen.getByRole("radio", { name: "Friday" }).getAttribute("data-state")).toBe("off")

    // Pressing the chosen day again does not leave the schedule without a day.
    await user.click(screen.getByRole("radio", { name: "Wednesday" }))
    expect(chosenWeekdays()).toEqual(["Wednesday"])
  })

  it("saves the chosen day, and it is still chosen after a reload", async () => {
    const api = installFakeApi()
    const user = userEvent.setup()
    renderHome()
    let settings = await openSettings(user)
    await chooseWeekly(user, settings)
    await user.click(screen.getByRole("radio", { name: "Friday" }))
    await user.click(screen.getByRole("radio", { name: "Wednesday" }))

    await user.click(within(settings).getByRole("button", { name: "Save changes" }))

    // What the server was sent, and what this browser kept.
    await waitFor(() => expect(api.scheduleSaves.at(-1)).toMatchObject({ enabled: true, frequency: "weekly", weekday: "wed" }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) ?? "{}")).toMatchObject({ scheduleEnabled: true, frequency: "weekly", weekday: "wed" })

    // Reload: a new page, the same browser storage and the same server.
    cleanup()
    renderHome()
    settings = await openSettings(user)
    await screen.findByText("Delivered on")
    expect(chosenWeekdays()).toEqual(["Wednesday"])
  })

  it("comes back from the server alone when this browser has forgotten everything", async () => {
    installFakeApi(configuredSchedule({ enabled: true, frequency: "weekly", weekday: "thu", interests: ALL_INTERESTS, nextDeliveryAt: "2099-01-01T07:00:00.000Z" }))
    const user = userEvent.setup()
    renderHome()
    await openSettings(user)

    await screen.findByText("Delivered on")
    expect(chosenWeekdays()).toEqual(["Thursday"])
  })

  it("uses the chosen day for the weekly summary", async () => {
    installFakeApi(configuredSchedule({ enabled: true, frequency: "weekly", weekday: "mon", interests: ALL_INTERESTS, nextDeliveryAt: "2099-01-05T07:00:00.000Z" }))
    renderHome()

    const summary = await screen.findByTestId("schedule-summary")
    expect(summary.textContent).toContain("Schedule active · Every Monday")
  })
})
