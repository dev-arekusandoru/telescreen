import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt, stubApi } from "@/test/api";

beforeEach(() => {
  localStorage.clear();
  stubApi();
});
afterEach(() => vi.unstubAllGlobals());

describe("app shell", () => {
  it("redirects / to the calendar and shows member progress", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: /\d{4}/ })).toBeInTheDocument();
    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Vale")).toBeInTheDocument();
  });

  it("hides Meals and Music until their module is enabled", async () => {
    renderAt("/settings");
    await screen.findByText("Theme");
    // Rail + tab bar render the same links.
    expect(screen.getAllByRole("link", { name: "Calendar" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Chores" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Meals" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Music" })).toBeNull();

    await userEvent.click(screen.getByRole("switch", { name: "Meals" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Meals" })).toHaveLength(2));
    expect(screen.queryByRole("link", { name: "Music" })).toBeNull();
  });

  it("switches the theme and persists it", async () => {
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("homehub.theme")).toBe("dark");
  });
});
