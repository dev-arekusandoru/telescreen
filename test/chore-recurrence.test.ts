import { describe, expect, it } from "vitest";
import {
  assigneeFor,
  datesInRange,
  nextDateAfter,
  normalizeRecurrence,
} from "../src/services/chore-recurrence.js";
import { todayIn } from "../src/lib/localdate.js";

describe("rotation index math", () => {
  const ids = ["a", "b", "c"];
  it("assigns members[n mod k]", () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => assigneeFor("rotating", ids, n))).toEqual(["a", "b", "c", "a", "b", "c"]);
  });
  it("is stable when occurrences are skipped: assignee depends only on the index", () => {
    const rec = normalizeRecurrence({ type: "daily", start: "2026-11-01" }, "2026-11-01");
    const byDate = Object.fromEntries(
      datesInRange(rec, "2026-11-01", "2026-11-06").map((d) => [d.date, assigneeFor("rotating", ids, d.ordinal)]),
    );
    // Nobody "skips" an assignee: 11-03 stays b's turn even if 11-02 was never done.
    expect(byDate).toEqual({
      "2026-11-01": "a",
      "2026-11-02": "b",
      "2026-11-03": "c",
      "2026-11-04": "a",
      "2026-11-05": "b",
      "2026-11-06": "c",
    });
    // A later window reports the same ordinals, i.e. the same assignees.
    expect(datesInRange(rec, "2026-11-05", "2026-11-06").map((d) => d.ordinal)).toEqual([4, 5]);
  });
  it("fixed and either", () => {
    expect(assigneeFor("fixed", ["x"], 7)).toBe("x");
    expect(assigneeFor("either", ["x", "y"], 7)).toBeNull();
    expect(assigneeFor("rotating", [], 3)).toBeNull();
  });
});

describe("recurrence", () => {
  it("every N weeks aligns to the anchor week", () => {
    // 2026-11-03 is a Tuesday (weekday 2).
    const rec = normalizeRecurrence({ type: "weekly", every: 2, weekday: 2, start: "2026-11-03" }, "2026-11-03");
    expect(datesInRange(rec, "2026-11-01", "2026-12-31").map((d) => d.date)).toEqual([
      "2026-11-03",
      "2026-11-17",
      "2026-12-01",
      "2026-12-15",
      "2026-12-29",
    ]);
  });
  it("moves a weekly start forward to the chosen weekday", () => {
    const rec = normalizeRecurrence({ type: "weekly", every: 1, weekday: 5, start: "2026-11-03" }, "2026-11-03");
    expect(rec).toMatchObject({ start: "2026-11-06" });
  });
  it("weekdays selects days of the week", () => {
    const rec = normalizeRecurrence({ type: "weekdays", days: [5, 1], start: "2026-11-02" }, "2026-11-02");
    expect(datesInRange(rec, "2026-11-02", "2026-11-16").map((d) => d.date)).toEqual([
      "2026-11-02",
      "2026-11-06",
      "2026-11-09",
      "2026-11-13",
      "2026-11-16",
    ]);
  });
  it("monthly clamps to the end of short months and leap years", () => {
    const rec = normalizeRecurrence({ type: "monthly", day: 31, start: "2027-01-01" }, "2027-01-01");
    expect(datesInRange(rec, "2027-01-01", "2027-05-31").map((d) => d.date)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
    const leap = normalizeRecurrence({ type: "monthly", day: 30, start: "2028-01-01" }, "2028-01-01");
    expect(datesInRange(leap, "2028-02-01", "2028-02-29").map((d) => d.date)).toEqual(["2028-02-29"]);
  });
  it("monthly skips a month's date that falls before the start", () => {
    const rec = normalizeRecurrence({ type: "monthly", day: 5, start: "2026-11-10" }, "2026-11-10");
    expect(datesInRange(rec, "2026-11-01", "2026-12-31").map((d) => d.date)).toEqual(["2026-12-05"]);
  });
  it("one-off yields a single date and no next", () => {
    const rec = normalizeRecurrence({ type: "once", date: "2026-11-20" }, "2026-11-03");
    expect(datesInRange(rec, "2026-01-01", "2027-01-01")).toEqual([{ date: "2026-11-20", ordinal: 0 }]);
    expect(nextDateAfter(rec, "2026-11-20")).toBeNull();
  });
  it("nextDateAfter is strictly after", () => {
    const rec = normalizeRecurrence({ type: "daily", start: "2026-11-01" }, "2026-11-01");
    expect(nextDateAfter(rec, "2026-11-03")).toBe("2026-11-04");
  });
});

describe("household-local dates", () => {
  it("todayIn follows the time zone", () => {
    const instant = new Date("2026-11-03T23:30:00Z");
    expect(todayIn("UTC", instant)).toBe("2026-11-03");
    expect(todayIn("Europe/Berlin", instant)).toBe("2026-11-04");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-11-03");
  });
});
