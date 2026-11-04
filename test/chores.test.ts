import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeCtx } from "../src/context.js";
import { updateHousehold } from "../src/services/households.js";
import { makeTestApp, makeTestCtx } from "./helpers.js";

interface Occ {
  id: string;
  choreId: string;
  indexN: number;
  dueDate: string;
  status: string;
  assigneeId: string | null;
  completedBy: string | null;
  nextAssigneeId: string | null;
}
interface ChoreOut {
  id: string;
  recurrence: { type: string; start?: string };
  archived: boolean;
}
interface Member {
  id: string;
  name: string;
}

/** App with a movable clock (Berlin household unless changed). */
function movableApp(startIso = "2026-11-03T12:00:00Z") {
  const t = makeTestCtx();
  let clock = new Date(startIso);
  const ctx = makeCtx(t.db, t.household.id, () => new Date(clock));
  const app = createApp({ db: t.db, now: ctx.now });
  async function request<T>(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { authorization: `Bearer ${t.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await app.request(`/api/v1${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }
  return { ...t, ctx, request, setNow: (iso: string) => (clock = new Date(iso)) };
}

type Requester = <T>(method: string, path: string, body?: unknown) => Promise<{ status: number; body: T }>;

async function people(request: Requester) {
  const res = await request<Member[]>("GET", "/members");
  return res.body.map((m) => m.id) as [string, string];
}

describe("chores CRUD", () => {
  it("creates, validates, archives and deletes", async () => {
    const t = makeTestApp();
    const [a, b] = (await t.request<Member[]>("GET", "/api/v1/members")).body.map((m) => m.id) as [string, string];
    const created = await t.request<ChoreOut>("POST", "/api/v1/chores", {
      name: "Dishes",
      icon: "🍽️",
      recurrence: { type: "daily" },
      assignment: "rotating",
      memberIds: [a, b],
      estimatedMinutes: 15,
    });
    expect(created.status).toBe(201);
    expect(created.body.recurrence).toEqual({ type: "daily", start: "2026-11-03" });

    expect(
      (await t.request("POST", "/api/v1/chores", { name: "x", recurrence: { type: "daily" }, assignment: "fixed", memberIds: [a, b] })).status,
    ).toBe(400);
    expect(
      (await t.request("POST", "/api/v1/chores", { name: "x", recurrence: { type: "daily" }, assignment: "fixed", memberIds: ["nope"] })).status,
    ).toBe(400);
    expect(
      (await t.request("POST", "/api/v1/chores", { name: "x", recurrence: { type: "monthly", day: 40 }, assignment: "either" })).status,
    ).toBe(400);

    const archived = await t.request<ChoreOut>("PATCH", `/api/v1/chores/${created.body.id}`, { archived: true });
    expect(archived.body.archived).toBe(true);
    expect((await t.request<ChoreOut[]>("GET", "/api/v1/chores")).body).toHaveLength(1);
    expect((await t.request("DELETE", `/api/v1/chores/${created.body.id}`)).status).toBe(200);
    expect((await t.request("PATCH", "/api/v1/chores/nope", { name: "y" })).status).toBe(404);
  });
});

describe("occurrences and completion", () => {
  it("materializes idempotently, rotates, completes and undoes", async () => {
    const t = movableApp();
    const [a, b] = await people(t.request);
    const chore = (
      await t.request<ChoreOut>("POST", "/chores", {
        name: "Trash",
        recurrence: { type: "daily" },
        assignment: "rotating",
        memberIds: [a, b],
      })
    ).body;
    const q = "/chore-occurrences?from=2026-11-03&to=2026-11-06";
    const first = (await t.request<Occ[]>("GET", q)).body;
    const second = (await t.request<Occ[]>("GET", q)).body;
    expect(second.map((o) => o.id)).toEqual(first.map((o) => o.id));
    expect(first.map((o) => [o.dueDate, o.indexN, o.assigneeId])).toEqual([
      ["2026-11-03", 0, a],
      ["2026-11-04", 1, b],
      ["2026-11-05", 2, a],
      ["2026-11-06", 3, b],
    ]);
    expect(first[0]!.nextAssigneeId).toBe(b);

    // Complete with credit to the other person, then undo.
    const done = await t.request<Occ>("POST", `/chore-occurrences/${first[0]!.id}/complete`, { completedBy: b });
    expect(done.body).toMatchObject({ status: "done", completedBy: b });
    expect((await t.request("POST", `/chore-occurrences/${first[0]!.id}/complete`, { completedBy: a })).status).toBe(409);
    expect((await t.request("POST", `/chore-occurrences/${first[0]!.id}/complete`, { completedBy: "zzz" })).status).toBe(400);
    const undone = await t.request<Occ>("POST", `/chore-occurrences/${first[0]!.id}/undo`);
    expect(undone.body).toMatchObject({ status: "open", completedBy: null });
    expect((await t.request("POST", `/chore-occurrences/${first[0]!.id}/undo`)).status).toBe(409);

    // Skip does not shift rotation of the others; reassign overrides one occurrence.
    expect((await t.request<Occ>("POST", `/chore-occurrences/${first[1]!.id}/skip`)).body.status).toBe("skipped");
    const re = await t.request<Occ>("POST", `/chore-occurrences/${first[2]!.id}/reassign`, { memberId: b });
    expect(re.body.assigneeId).toBe(b);
    const after = (await t.request<Occ[]>("GET", q)).body;
    expect(after.map((o) => o.assigneeId)).toEqual([a, b, b, b]);
    expect(after.map((o) => o.nextAssigneeId)).toEqual([b, a, b, a]);

    expect((await t.request("GET", `/chore-occurrences?from=2026-11-06&to=2026-11-03`)).status).toBe(400);
    expect(chore.id).toBeTruthy();
  });

  it("either chores credit the completer and show up in progress", async () => {
    const t = movableApp();
    const [a, b] = await people(t.request);
    await t.request("POST", "/chores", { name: "Fixed", recurrence: { type: "daily" }, assignment: "fixed", memberIds: [a] });
    await t.request("POST", "/chores", { name: "Either", recurrence: { type: "daily" }, assignment: "either", memberIds: [] });
    const day = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03&carryover=true")).body;
    expect(day).toHaveLength(2);
    const either = day.find((o) => o.assigneeId === null)!;
    const fixed = day.find((o) => o.assigneeId === a)!;

    let progress = (await t.request<Array<{ memberId: string; done: number; total: number }>>("GET", "/chore-occurrences/progress?date=2026-11-03")).body;
    expect(progress).toEqual([
      { memberId: a, done: 0, total: 1 },
      { memberId: b, done: 0, total: 0 },
    ]);

    await t.request("POST", `/chore-occurrences/${either.id}/complete`, { completedBy: b });
    await t.request("POST", `/chore-occurrences/${fixed.id}/complete`, { completedBy: a });
    progress = (await t.request("GET", "/chore-occurrences/progress?date=2026-11-03")).body as typeof progress;
    expect(progress).toEqual([
      { memberId: a, done: 1, total: 1 },
      { memberId: b, done: 1, total: 1 },
    ]);
    const mine = (await t.request<Occ[]>("GET", `/chore-occurrences?from=2026-11-03&to=2026-11-03&member=${b}`)).body;
    expect(mine.map((o) => o.id)).toEqual([either.id]);
  });
});

describe("missed rule", () => {
  it("daily chores expire at day end (household time zone), never reaching Today", async () => {
    // 22:30Z on Nov 3 is already Nov 4 in Berlin.
    const t = movableApp("2026-11-03T12:00:00Z");
    const [a] = await people(t.request);
    await t.request("POST", "/chores", { name: "Daily", recurrence: { type: "daily" }, assignment: "fixed", memberIds: [a] });
    await t.request("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03");

    t.setNow("2026-11-03T22:30:00Z"); // Berlin: Nov 3, 23:30 → still open
    let list = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03")).body;
    expect(list[0]!.status).toBe("open");

    t.setNow("2026-11-03T23:30:00Z"); // Berlin: Nov 4, 00:30 → missed
    list = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-04&carryover=false")).body;
    expect(list.map((o) => [o.dueDate, o.status])).toEqual([
      ["2026-11-03", "missed"],
      ["2026-11-04", "open"],
    ]);
    const today = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-04&to=2026-11-04&carryover=true")).body;
    expect(today.map((o) => [o.dueDate, o.status])).toEqual([["2026-11-04", "open"]]);
    // Missed can no longer be completed.
    expect((await t.request("POST", `/chore-occurrences/${list[0]!.id}/complete`, { completedBy: a })).status).toBe(409);
  });

  it("weekly chores stay live (and carry over to Today) until the next one is due", async () => {
    const t = movableApp("2026-11-03T12:00:00Z"); // Tuesday
    const [a] = await people(t.request);
    await t.request("POST", "/chores", {
      name: "Weekly",
      recurrence: { type: "weekly", every: 1, weekday: 2 },
      assignment: "fixed",
      memberIds: [a],
    });
    await t.request("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03");

    t.setNow("2026-11-09T12:00:00Z"); // following Monday: week not over
    let today = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-09&to=2026-11-09&carryover=true")).body;
    expect(today.map((o) => [o.dueDate, o.status])).toEqual([["2026-11-03", "open"]]);

    t.setNow("2026-11-10T12:00:00Z"); // next Tuesday: the new one is due, the old one is missed
    today = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-10&to=2026-11-10&carryover=true")).body;
    expect(today.map((o) => [o.dueDate, o.status])).toEqual([["2026-11-10", "open"]]);
    const history = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03")).body;
    expect(history[0]!.status).toBe("missed");
  });

  it("one-offs never expire", async () => {
    const t = movableApp("2026-11-03T12:00:00Z");
    const [a] = await people(t.request);
    await t.request("POST", "/chores", { name: "Once", recurrence: { type: "once", date: "2026-11-03" }, assignment: "fixed", memberIds: [a] });
    await t.request("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03");
    t.setNow("2026-11-20T12:00:00Z");
    const today = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-20&to=2026-11-20&carryover=true")).body;
    expect(today.map((o) => [o.dueDate, o.status])).toEqual([["2026-11-03", "open"]]);
  });

  it("follows a household time zone change", async () => {
    const t = movableApp("2026-11-03T23:30:00Z");
    updateHousehold(t.ctx, { timezone: "America/Los_Angeles" }); // still Nov 3 there
    const [a] = await people(t.request);
    await t.request("POST", "/chores", { name: "D", recurrence: { type: "daily" }, assignment: "fixed", memberIds: [a] });
    const list = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-03")).body;
    expect(list.map((o) => [o.dueDate, o.status])).toEqual([["2026-11-03", "open"]]);
  });
});

describe("editing a chore keeps history", () => {
  it("schedule edit only regenerates future open occurrences", async () => {
    const t = movableApp("2026-11-03T12:00:00Z");
    const [a, b] = await people(t.request);
    const chore = (
      await t.request<ChoreOut>("POST", "/chores", {
        name: "Rot",
        recurrence: { type: "daily", start: "2026-11-01" },
        assignment: "rotating",
        memberIds: [a, b],
      })
    ).body;
    const before = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-01&to=2026-11-06")).body;
    // 11-01 done, 11-02 missed (today is 11-03), 11-03.. open
    await t.request("POST", `/chore-occurrences/${before[0]!.id}/complete`, { completedBy: a });

    const patched = await t.request<ChoreOut>("PATCH", `/chores/${chore.id}`, {
      recurrence: { type: "weekly", every: 1, weekday: 5 },
    });
    expect(patched.body.recurrence).toEqual({ type: "weekly", every: 1, weekday: 5, start: "2026-11-06" });

    const after = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-01&to=2026-11-20")).body;
    expect(after.map((o) => [o.dueDate, o.status])).toEqual([
      ["2026-11-01", "done"],
      ["2026-11-02", "missed"],
      ["2026-11-06", "open"],
      ["2026-11-13", "open"],
      ["2026-11-20", "open"],
    ]);
    // Indexes keep counting after the retained history (0,1 kept; new ones 2, 3, 4), and are unique.
    expect(after.map((o) => o.indexN)).toEqual([0, 1, 2, 3, 4]);
    expect(after[2]!.assigneeId).toBe(a); // 2 mod 2
  });

  it("rotation reorder regenerates future open occurrences only", async () => {
    const t = movableApp("2026-11-03T12:00:00Z");
    const [a, b] = await people(t.request);
    const chore = (
      await t.request<ChoreOut>("POST", "/chores", {
        name: "Rot",
        recurrence: { type: "daily" },
        assignment: "rotating",
        memberIds: [a, b],
      })
    ).body;
    const first = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-05")).body;
    await t.request("POST", `/chore-occurrences/${first[0]!.id}/complete`, { completedBy: a });
    await t.request("PATCH", `/chores/${chore.id}`, { memberIds: [b, a] });
    const after = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-05")).body;
    expect(after.map((o) => [o.status, o.assigneeId, o.indexN])).toEqual([
      ["done", a, 0],
      ["open", a, 1], // order is now [b, a]: index 1 → a
      ["open", b, 2],
    ]);
  });

  it("archiving drops future open occurrences but keeps history", async () => {
    const t = movableApp("2026-11-03T12:00:00Z");
    const [a] = await people(t.request);
    const chore = (
      await t.request<ChoreOut>("POST", "/chores", { name: "D", recurrence: { type: "daily" }, assignment: "fixed", memberIds: [a] })
    ).body;
    const occ = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-05")).body;
    await t.request("POST", `/chore-occurrences/${occ[0]!.id}/complete`, { completedBy: a });
    await t.request("PATCH", `/chores/${chore.id}`, { archived: true });
    const after = (await t.request<Occ[]>("GET", "/chore-occurrences?from=2026-11-03&to=2026-11-05")).body;
    expect(after.map((o) => o.status)).toEqual(["done"]);
  });
});
