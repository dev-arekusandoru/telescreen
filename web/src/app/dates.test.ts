import { describe, expect, it } from "vitest";
import { ago } from "./dates";

describe("ago", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  it("formats relative times", () => {
    expect(ago(null, now)).toBe("never");
    expect(ago("2026-11-03T11:59:40Z", now)).toBe("just now");
    expect(ago("2026-11-03T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-11-03T09:00:00Z", now)).toBe("3 h ago");
    expect(ago("2026-11-01T12:00:00Z", now)).toBe("2 d ago");
  });
});
