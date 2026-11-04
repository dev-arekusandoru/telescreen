import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pub = (p: string) => `public/${p.replace(/^\//, "")}`;
const manifest = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8")) as {
  name: string;
  display: string;
  start_url: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
};

describe("PWA", () => {
  it("manifest is installable", () => {
    expect(manifest.name).toBe("HomeHub");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) expect(existsSync(pub(icon.src)), icon.src).toBe(true);
  });

  it("index.html links the manifest and iOS tags", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("apple-mobile-web-app-capable");
    expect(existsSync(pub("icons/apple-touch-icon.png"))).toBe(true);
  });

  it("service worker never caches the API", () => {
    const sw = readFileSync(pub("sw.js"), "utf8");
    expect(sw).toContain('"/api/"');
  });
});
