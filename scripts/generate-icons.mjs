// Renders the PWA icons into web/public/icons with Playwright's Chromium (Fraunces from node_modules).
// Run: node scripts/generate-icons.mjs   (re-run only when the icon design changes; PNGs are committed.)
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "web/public/icons");
const font = `data:font/woff2;base64,${readFileSync(
  path.join(root, "web/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2"),
).toString("base64")}`;
mkdirSync(out, { recursive: true });

// Palette = light tokens (tokens.css): paper, terracotta, sage, ink.
const PAPER = "#f3ebdd";
const TERRACOTTA = "#a84c2a";
const SAGE = "#557f61";

/** `corner`: rounded radius in 1024-space (0 = full bleed for maskable / apple-touch). */
const svg = (size, corner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${corner}" fill="${PAPER}"/>
  <text x="512" y="650" text-anchor="middle" font-family="Fraunces Variable" font-weight="700" font-size="560" fill="${TERRACOTTA}">T</text>
  <rect x="352" y="716" width="320" height="14" rx="7" fill="${TERRACOTTA}" opacity="0.35"/>
  <circle cx="462" cy="792" r="26" fill="${TERRACOTTA}"/>
  <circle cx="562" cy="792" r="26" fill="${SAGE}"/>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, corner: 224 },
  { file: "icon-512.png", size: 512, corner: 224 },
  { file: "icon-maskable-512.png", size: 512, corner: 0 },
  { file: "apple-touch-icon.png", size: 180, corner: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<style>@font-face{font-family:"Fraunces Variable";src:url("${font}");font-weight:100 900}html,body{margin:0;background:transparent}</style>${svg(t.size, t.corner)}`,
  );
  await page.evaluate(() => document.fonts.load('700 100px "Fraunces Variable"'));
  await page.waitForTimeout(100);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  writeFileSync(path.join(out, t.file), buf);
}
writeFileSync(path.join(root, "web/public/favicon.svg"), svg(64, 224).replace(/font-family="Fraunces Variable"/, 'font-family="Georgia,serif"'));
await browser.close();
