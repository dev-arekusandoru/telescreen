/*
 * Telescreen service worker: installability + app-shell caching only (SPEC non-goal: offline mode).
 * - Hashed /assets/* are cache-first (immutable).
 * - Navigations are network-first; the cached shell is only a fallback so the app opens
 *   (and shows its own error states) when the server is briefly unreachable.
 * - API, OpenAPI, health and auth paths are never touched.
 * Bump CACHE when this file's strategy changes; old caches are deleted on activate.
 */
const CACHE = "telescreen-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const BYPASS = ["/api/", "/openapi.json", "/health", "/auth/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((p) => url.pathname === p || url.pathname.startsWith(p))) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
