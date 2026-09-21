import { describe, expect, it } from "vitest"
import { describeChange, formatCount, formatEuro, formatMinutes, formatPercent, formatSeconds, formatShortDate } from "./format"

describe("analytics formatting", () => {
  it("rounds sensibly and shows a dash for a missing value", () => {
    expect(formatPercent(0.7421)).toBe("74.2%")
    expect(formatPercent(null)).toBe("—")
    expect(formatCount(1683.6)).toBe("1,684")
    expect(formatEuro(0.4291)).toBe("€0.43")
    expect(formatEuro(1293.04)).toBe("€1,293")
    expect(formatEuro(null)).toBe("—")
    expect(formatSeconds(1.234)).toBe("1.2s")
    expect(formatSeconds(134.4)).toBe("2m 14s")
    expect(formatSeconds(125.6)).toBe("2m 06s")
    expect(formatMinutes(15.86)).toBe("15.9 min")
    expect(formatShortDate("2026-09-03")).toBe("Sep 3")
  })

  it("describes a change in percent for counts and in points for rates", () => {
    expect(describeChange(112.4, 100, "relative")).toEqual({ text: "+12.4%", direction: "up", tone: "good" })
    expect(describeChange(0.775, 0.76, "points")).toEqual({ text: "+1.5 pp", direction: "up", tone: "good" })
    expect(describeChange(0.7, 0.76, "points")).toEqual({ text: "−6.0 pp", direction: "down", tone: "bad" })
  })

  it("treats a lower number as better when told to", () => {
    expect(describeChange(120, 130, "relative", "down")).toEqual({ text: "−7.7%", direction: "down", tone: "good" })
    expect(describeChange(0.16, 0.14, "points", "down")?.tone).toBe("bad")
  })

  it("is flat below the display precision, and empty without a comparison", () => {
    expect(describeChange(100.01, 100, "relative")).toEqual({ text: "0.0%", direction: "flat", tone: "neutral" })
    expect(describeChange(1, null, "relative")).toBeNull()
    expect(describeChange(null, 1, "relative")).toBeNull()
    expect(describeChange(5, 0, "relative")).toBeNull()
  })
})
