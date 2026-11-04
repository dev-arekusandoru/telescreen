/** Register the app-shell service worker (installability only). Production builds on secure origins. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not installable (e.g. insecure origin); the app works without it.
    });
  });
}
