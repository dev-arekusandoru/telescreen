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
  it("redirects / to the calendar and shows the member chips", async () => {
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Add event" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^Mara: \d+ of \d+ chores/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Theo: \d+ of \d+ chores/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show everyone on the calendar" })).toBeNull();
  });

  it("hides Meals and Music until their module is enabled", async () => {
    renderAt("/settings");
    await screen.findByRole("button", { name: /^Members/ });
    // Rail + tab bar render the same links.
    expect(screen.getAllByRole("link", { name: "Calendar" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Chores" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Meals" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Music" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Meals/ }));
    await userEvent.click(await screen.findByRole("switch", { name: "Meals" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Meals" })).toHaveLength(2));
    expect(screen.queryByRole("link", { name: "Music" })).toBeNull();
  });

  it("switches the theme and persists it", async () => {
    renderAt("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Appearance/ }));
    await userEvent.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("telescreen.theme")).toBe("dark");
  });
});
