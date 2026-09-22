// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generatedEpisode, generatedEpisode2, installDomPolyfills, installFakeApi } from "@/test/dom"
import { EpisodesPage } from "./EpisodesPage"

function renderEpisodes() {
  return render(
    <MemoryRouter initialEntries={["/episodes"]}>
      <Routes>
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/episodes" element={<EpisodesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  installDomPolyfills()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("terminology", () => {
  it("calls the page and its podcasts 'Podcasts', not 'Episodes'", async () => {
    installFakeApi(undefined, [generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(screen.getByText("Your podcasts")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bEpisodes?\b/)
  })
})

describe("back to Home", () => {
  it("navigates to / when clicked", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderEpisodes()

    await user.click(screen.getByRole("link", { name: /Back to Home/i }))
    expect(await screen.findByText("Home page")).toBeTruthy()
  })
})

describe("real podcasts only", () => {
  it("shows an empty state, not a fabricated podcast, when none have been generated yet", async () => {
    installFakeApi()
    renderEpisodes()

    await screen.findByText("No podcasts yet")
    expect(screen.queryByText(generatedEpisode.title)).toBeNull()
  })

  it("shows every real generated podcast", async () => {
    installFakeApi(undefined, [generatedEpisode2, generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(screen.getByText(generatedEpisode2.title)).toBeTruthy()
    expect(screen.queryByText("No podcasts yet")).toBeNull()
  })

  it("never shows the onboarding demo podcast or any other fabricated podcast", async () => {
    installFakeApi(undefined, [generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(document.body.textContent).not.toMatch(/Your First ProsperPod|Inside the New Wave of Foundation Models/i)
  })
})

describe("summary and sources", () => {
  // generatedEpisode2 is the second row here (generatedEpisode is newer), proving this isn't only on a featured card.
  it("lets a row's overflow menu show its summary", async () => {
    installFakeApi(undefined, [generatedEpisode2, generatedEpisode])
    const user = userEvent.setup()
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    await user.click(screen.getByRole("button", { name: `More options for ${generatedEpisode2.title}` }))
    await user.click(await screen.findByRole("menuitem", { name: /view summary/i }))

    expect(await screen.findByText(generatedEpisode2.description)).toBeTruthy()
    expect(screen.getByText(generatedEpisode2.topics[0])).toBeTruthy()
  })

  it("lets a row's overflow menu show its sources", async () => {
    installFakeApi(undefined, [generatedEpisode2, generatedEpisode])
    const user = userEvent.setup()
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    await user.click(screen.getByRole("button", { name: `More options for ${generatedEpisode2.title}` }))
    await user.click(await screen.findByRole("menuitem", { name: /see sources/i }))

    expect(await screen.findByText(generatedEpisode2.sources[0].name)).toBeTruthy()
  })
})
