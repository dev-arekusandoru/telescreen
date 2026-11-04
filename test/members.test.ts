import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

interface Member {
  id: string;
  name: string;
  colorToken: string;
  initial: string;
  sort: number;
}

describe("members", () => {
  it("seeds Alex and Vale", async () => {
    const t = makeTestApp();
    const res = await t.request<Member[]>("GET", "/api/v1/members");
    expect(res.status).toBe(200);
    expect(res.body.map((m) => [m.name, m.colorToken, m.initial])).toEqual([
      ["Alex", "terracotta", "A"],
      ["Vale", "sage", "V"],
    ]);
  });

  it("creates, updates and deletes", async () => {
    const t = makeTestApp();
    const created = await t.request<Member>("POST", "/api/v1/members", { name: "robin", colorToken: "plum" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "robin", initial: "R", sort: 2 });

    const patched = await t.request<Member>("PATCH", `/api/v1/members/${created.body.id}`, {
      name: "Robin",
      colorToken: "ochre",
    });
    expect(patched.body).toMatchObject({ name: "Robin", colorToken: "ochre" });

    const del = await t.request("DELETE", `/api/v1/members/${created.body.id}`);
    expect(del.status).toBe(200);
    const list = await t.request<Member[]>("GET", "/api/v1/members");
    expect(list.body).toHaveLength(2);
  });

  it("rejects bad input and unknown ids", async () => {
    const t = makeTestApp();
    expect((await t.request("POST", "/api/v1/members", { name: "", colorToken: "sage" })).status).toBe(400);
    expect((await t.request("POST", "/api/v1/members", { name: "X", colorToken: "neon" })).status).toBe(400);
    expect((await t.request("PATCH", "/api/v1/members/nope", { name: "X" })).status).toBe(404);
    expect((await t.request("DELETE", "/api/v1/members/nope")).status).toBe(404);
  });
});
