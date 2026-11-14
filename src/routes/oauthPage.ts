/** Server-rendered page for OAuth callback outcomes (browsers arrive without a bearer token). */
export function oauthPage(title: string, detail: string): string {
  const clean = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Telescreen</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>${clean(title)}</h1><p>${clean(detail)}</p><p><a href="/settings">Back to Settings</a></p>`;
}
