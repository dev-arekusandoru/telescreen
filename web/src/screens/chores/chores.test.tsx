import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/app/localdate";
import { MEMBERS, defaultSettings, renderAt } from "@/test/api";

type Occ = {
  id: string;
  choreId: string;
  indexN: number;
  dueDate: string;
  status: "open" | "done" | "missed" | "skipped";
  assigneeId: string | null;
  completedBy: string | null;
  completedAt: string | null;
  name: string;
  icon: string | null;
  notes: null;
  dueTime: null;
  estimatedMinutes: null;
  assignment: "fixed" | "rotating" | "either";
  nextAssigneeId: string | null;
};

const TZ = "Europe/Berlin";

function makeOcc(id: string, name: string, over: Partial<Occ>): Occ {
  return {
    id,
    choreId: `c_${id}`,
    indexN: 0,
    dueDate: localDate(new Date(), TZ),
    status: "open",
    assigneeId: "mem_a",
    completedBy: null,
    completedAt: null,
    name,
    icon: null,
    notes: null,
    dueTime: null,
    estimatedMinutes: null,
    assignment: "fixed",
    nextAssigneeId: null,
    ...over,
  };
}

let occs: Occ[];
let calls: Array<{ path: string; body: unknown }>;

function stubChoresApi() {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const url = new URL(req.url);
      const path = url.pathname.replace("/api/v1", "");
      if (path === "/household") return json({ id: "hh", name: "Home", timezone: TZ, weekStart: 0, themeDefault: "system" });
      if (path === "/members") return json(MEMBERS);
      if (path === "/settings") return json(defaultSettings());
      if (path === "/chores") return json([]);
      if (path === "/chore-occurrences") return json(occs);
      if (path === "/chore-occurrences/progress") {
        return json(
          MEMBERS.map((m) => {
            const mine = occs.filter((o) => (o.status === "done" ? o.completedBy : o.assigneeId) === m.id);
            return { memberId: m.id, done: mine.filter((o) => o.status === "done").length, total: mine.length };
          }),
        );
      }
      const action = /^\/chore-occurrences\/([^/]+)\/(complete|undo)$/.exec(path);
      if (action && req.method === "POST") {
        const body = (await req.json()) as { completedBy?: string };
        calls.push({ path, body });
        const occ = occs.find((o) => o.id === action[1])!;
        if (action[2] === "complete") Object.assign(occ, { status: "done", completedBy: body.completedBy });
        else Object.assign(occ, { status: "open", completedBy: null });
        return json(occ);
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

beforeEach(() => {
  // jsdom lacks pointer capture, which Radix Toast's swipe handling calls.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  localStorage.clear();
  calls = [];
  occs = [
    makeOcc("o1", "Dishes", { assigneeId: "mem_a", assignment: "rotating", nextAssigneeId: "mem_b" }),
    makeOcc("o2", "Bins", { assigneeId: "mem_b" }),
    makeOcc("o3", "Water plants", { assigneeId: null, assignment: "either" }),
    makeOcc("o4", "Old missed", { assigneeId: "mem_a", status: "missed" }),
  ];
  stubChoresApi();
});
afterEach(() => vi.unstubAllGlobals());

describe("chores today", () => {
  it("groups by member and Shared and hides missed chores", async () => {
    renderAt("/chores");
    const mara = await screen.findByRole("region", { name: "Mara" });
    expect(within(mara).getByRole("button", { name: "Dishes" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Theo" })).getByRole("button", { name: "Bins" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Shared" })).getByRole("button", { name: "Water plants" })).toBeInTheDocument();
    expect(screen.queryByText("Old missed")).toBeNull();
    expect(within(mara).getByText("Rotating · next: Theo")).toBeInTheDocument();
  });

  it("confirms with the assignee preselected, checks off, and undoes from the toast", async () => {
    renderAt("/chores");
    await userEvent.click(await screen.findByRole("button", { name: "Dishes" }));

    const confirm = await screen.findByRole("button", { name: "Mark done for Mara" });
    await userEvent.click(confirm);

    await waitFor(() => expect(calls).toEqual([{ path: "/chore-occurrences/o1/complete", body: { completedBy: "mem_a" } }]));
    expect(await screen.findByRole("button", { name: "Dishes, done" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Mara completed “Dishes”")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ path: "/chore-occurrences/o1/undo", body: {} }));
    expect(await screen.findByRole("button", { name: "Dishes" })).toHaveAttribute("aria-pressed", "false");
  });

  it("lets the other member take credit, and either chores complete with one pick", async () => {
    renderAt("/chores");
    await userEvent.click(await screen.findByRole("button", { name: "Bins" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mara" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark done for Mara" }));
    await waitFor(() => expect(calls[0]).toEqual({ path: "/chore-occurrences/o2/complete", body: { completedBy: "mem_a" } }));

    await userEvent.click(await screen.findByRole("button", { name: "Water plants" }));
    // No preselection and no confirm button: choosing a person completes it.
    expect(screen.queryByRole("button", { name: /Mark done/ })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Theo" }));
    await waitFor(() => expect(calls[1]).toEqual({ path: "/chore-occurrences/o3/complete", body: { completedBy: "mem_b" } }));
    const theo = screen.getByRole("region", { name: "Theo" });
    expect(await within(theo).findByRole("button", { name: "Water plants, done" })).toBeInTheDocument();
  });

  it("tapping a done chore undoes it", async () => {
    occs[0]!.status = "done";
    occs[0]!.completedBy = "mem_a";
    renderAt("/chores");
    await userEvent.click(await screen.findByRole("button", { name: "Dishes, done" }));
    await waitFor(() => expect(calls[0]).toEqual({ path: "/chore-occurrences/o1/undo", body: {} }));
    expect(await screen.findByText("Marked not done")).toBeInTheDocument();
  });
});
