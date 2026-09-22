// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { installDomPolyfills } from "@/test/dom"
import { DashboardPage } from "./DashboardPage"

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => installDomPolyfills())
afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )

/** The number under a KPI label, e.g. "Podcasts generated" -> "1,720". */
const kpi = (label: RegExp) => {
  const card = screen.getAllByText(label)[0].parentElement as HTMLElement
  return card.querySelectorAll("p")[1].textContent
}

const SECTION_ORDER = ["Product usage", "Quality", "Content & engagement", "Technology", "Reuse", "API & economics"]

describe("DashboardPage", () => {
  it("defaults to 30 days and marks itself internal, with no subtitle under the heading", () => {
    renderPage()
    expect(screen.getByRole("radio", { name: "Last 30 days" })).toHaveProperty("ariaChecked", "true")
    expect(screen.getByText("Internal")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Product analytics" })).toBeTruthy()
    expect(screen.queryByText(/not visible to end users/)).toBeNull()
  })

  it("shows the seven KPI cards in order, and no regeneration rate anywhere", () => {
    renderPage()
    const labels = ["Weekly active users", "Monthly active users", "7-day retention", "Podcasts generated", "Completion rate", "Like / dislike rate", "Total API cost"]
    // Some labels are reused elsewhere on the page (e.g. "Podcasts generated" also titles the usage chart);
    // the KPI row is what's rendered first, so its instance is always the first match.
    const found = labels.map((label) => screen.getAllByText(label)[0])
    for (let i = 1; i < found.length; i++) {
      expect(found[i - 1].compareDocumentPosition(found[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByText(/^Like \d/)).toBeTruthy()
    expect(screen.getByText(/^Dislike \d/)).toBeTruthy()
    expect(screen.queryByText(/Regeneration rate/i)).toBeNull()
  })

  it("shows every section in the requested order, with Reuse instead of Personalization", () => {
    renderPage()
    const headings = SECTION_ORDER.map((title) => screen.getByRole("heading", { level: 2, name: title }))
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i - 1].compareDocumentPosition(headings[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.queryByRole("heading", { level: 2, name: "Personalization" })).toBeNull()
    expect(screen.getByText("Research reuse")).toBeTruthy()
    expect(screen.queryByText(/top voices/i)).toBeNull()
    expect(screen.queryByText(/Voice analytics/i)).toBeNull()
  })

  it("shows Content & engagement as one card with a working dimension selector", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByText("Artificial Intelligence")).toBeTruthy()

    const select = screen.getByRole("combobox", { name: "Dimension" })
    await user.click(select)
    await user.click(await screen.findByRole("option", { name: "Language" }))

    expect(screen.getByText("English")).toBeTruthy()
    expect(screen.queryByText("Artificial Intelligence")).toBeNull()

    await user.click(screen.getByRole("combobox", { name: "Dimension" }))
    await user.click(await screen.findByRole("option", { name: "Duration" }))
    expect(screen.getByText("5–10 min")).toBeTruthy()
  })

  it("switches between like and dislike trends in Quality", async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole("radio", { name: "Like" })).toHaveProperty("ariaChecked", "true")
    await user.click(screen.getByRole("radio", { name: "Dislike" }))
    expect(screen.getByRole("radio", { name: "Dislike" })).toHaveProperty("ariaChecked", "true")
  })

  it("changes the numbers with the range and never renders NaN or undefined", async () => {
    const user = userEvent.setup()
    renderPage()
    const seen = new Map<string, string | null>()

    for (const days of [7, 30, 90, 7]) {
      await user.click(screen.getByRole("radio", { name: `Last ${days} days` }))
      const text = document.body.textContent ?? ""
      expect(text).not.toMatch(/NaN|undefined|Infinity/)
      seen.set(String(days), kpi(/^Podcasts generated$/i))
    }

    const counts = [seen.get("7"), seen.get("30"), seen.get("90")].map((value) => Number((value ?? "").replace(/,/g, "")))
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
  })
})
