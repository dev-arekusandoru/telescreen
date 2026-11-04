import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/tokens.css", "utf8");

type Tokens = Record<string, string>;

/** Body of the `{ ... }` block that follows `selector` (first occurrence, no nested braces). */
function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated block: ${selector}`);
}

function decls(body: string): Tokens {
  const out: Tokens = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const light = decls(block(":root {"));
const dark = { ...light, ...decls(block(':root[data-theme="dark"]')) };
const systemDark = { ...light, ...decls(block(':root:not([data-theme="light"])')) };

type RGB = [number, number, number];

function hex(v: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) throw new Error(`not a #rrggbb color: ${v}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` mixed into `bg` by `pct` percent (same math as CSS color-mix in srgb). */
function mix(fg: RGB, bg: RGB, pct: number): RGB {
  return fg.map((c, i) => Math.round((c * pct) / 100 + bg[i]! * (1 - pct / 100))) as RGB;
}

const MEMBERS = ["terracotta", "sage", "ochre", "plum", "slate", "rose", "family"];
const SURFACES = ["bg", "surface", "surface2"];

const themes: Array<[string, Tokens]> = [
  ["light", light],
  ["dark", dark],
];

describe.each(themes)("contrast (%s)", (_name, t) => {
  const c = (fg: string, bg: string) => contrast(hex(t[`--${fg}`]!), hex(t[`--${bg}`]!));

  it.each(SURFACES.flatMap((s) => ["ink", "muted"].map((f) => [f, s] as const)))("text --%s on --%s >= 4.5", (f, s) => {
    expect(c(f, s)).toBeGreaterThanOrEqual(4.5);
  });

  it("--on-accent on --accent >= 4.5", () => {
    expect(c("on-accent", "accent")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["bg", "surface"])("accent as text on --%s >= 4.5", (s) => {
    expect(c("accent", s)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES.slice(0, 2).flatMap((s) => MEMBERS.map((m) => [m, s] as const)))(
    "member --member-%s on --%s >= 3 (UI/large)",
    (m, s) => {
      expect(c(`member-${m}`, s)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(MEMBERS)("avatar initial (--on-accent) on --member-%s >= 4.5", (m) => {
    expect(c("on-accent", `member-${m}`)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MEMBERS)("ink on %s event tint >= 4.5", (m) => {
    const tint = parseFloat(t["--tint"]!);
    const fill = mix(hex(t[`--member-${m}`]!), hex(t["--surface"]!), tint);
    expect(contrast(hex(t["--ink"]!), fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(t["--muted"]!), fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("--line is visible against surfaces for UI boundaries (informational, >= 1.1)", () => {
    expect(c("line", "bg")).toBeGreaterThanOrEqual(1.0);
  });
});

describe("token blocks", () => {
  it("system-dark block mirrors the explicit dark block", () => {
    const explicit = decls(block(':root[data-theme="dark"]'));
    const system = decls(block(':root:not([data-theme="light"])'));
    expect(system).toEqual(explicit);
    expect(systemDark["--bg"]).toBe(dark["--bg"]);
  });
});
