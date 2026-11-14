import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeTestApp, makeTestCtx } from "./helpers.js";

describe("auth", () => {
  it("health is public", async () => {
    const t = makeTestApp();
    expect((await t.app.request("/api/v1/health")).status).toBe(200);
  });

  it("requires a token by default", async () => {
    const t = makeTestApp();
    expect((await t.app.request("/api/v1/members")).status).toBe(401);
    expect((await t.app.request("/api/v1/members", { headers: { authorization: "Bearer ts_bad" } })).status).toBe(401);
  });

  it("trust-network allows tokenless requests but still verifies sent tokens", async () => {
    const { db } = makeTestCtx();
    const app = createApp({ db, trustNetwork: true });
    expect((await app.request("/api/v1/members")).status).toBe(200);
    expect((await app.request("/api/v1/members", { headers: { authorization: "Bearer ts_bad" } })).status).toBe(401);
  });
});
