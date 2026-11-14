# Documentation site

These pages are Markdown in `docs/`. VitePress renders them, and GitHub Actions publishes the result. You only edit Markdown for content; the site configuration lives in `docs/.vitepress/config.mts` and the theme in `docs/.vitepress/theme/`.

## How the two directories relate

| Path | Contents |
|---|---|
| `docs/*.md` | Page sources. A page's URL is its path without `.md`: `develop/setup.md` becomes `/develop/setup`. |
| `docs/.vitepress/` | VitePress config, sidebar, theme CSS, and the `@telescreen/docs` package. |
| `docs/public/` | Static assets such as the site icon. |

`docs/index.md` is the landing page and links to every section. Other pages start with a single `# Title` and no frontmatter; VitePress uses the H1 as the page title.

## Preview locally

```bash
pnpm install
pnpm docs:dev
```

`pnpm docs:dev` runs VitePress in the `docs` workspace on port 5173. Because the site is published under a base path, open `http://localhost:5173/telescreen/`, not the bare root. Edits reload in place.

To check the production build:

```bash
pnpm docs:build   # writes docs/.vitepress/dist
pnpm docs:serve   # serves the build on port 4173
```

`pnpm docs:build` is exactly what CI runs, writing `docs/.vitepress/dist`. VitePress fails the build on dead internal links and missing local images, so run it before opening a pull request that touches documentation.

## Add a page

1. Create the file under the right section, for example `docs/use/timers.md`.
2. Start with one H1 in sentence case, then prose, tables and code fences. Do not add frontmatter.
3. Add an entry to the matching group in `docs/.vitepress/config.mts`:

```ts
{
  text: 'Use Telescreen',
  items: [
    { text: 'Calendar', link: '/use/calendar' },
    // ...
    { text: 'Timers', link: '/use/timers' },
  ],
},
```

A page that is not in the sidebar still builds, but nothing links to it, so it is effectively invisible. If you add a page, add it to `docs/index.md` as well.

## Links and images

- Link to other pages with a relative path and no extension: `[Install](../start/install)`. VitePress resolves it to the published route.
- Link to code or repository files with a full GitHub URL: `https://github.com/dev-arekusandoru/telescreen/blob/main/src/app.ts` for a file, `/tree/main/src/routes` for a directory. Do not use filesystem paths, which are meaningless once published.
- Keep images beside the page that uses them and reference them relatively, for example `![Event sheet](./event-sheet.png)`. A missing image fails the build.
- Internal links are checked, so a `#section` link must match a real heading.

## Styling

The theme is VitePress's default theme with brand overrides in `docs/.vitepress/theme/custom.css`. It defines the terracotta palette for light and dark mode (`--vp-c-brand-1` and related variables). Prefer those variables over hard-coded colors so both modes keep working.

## Publishing

The production site is **https://dev-arekusandoru.github.io/telescreen**. The base path is `/telescreen/` and `cleanUrls` is on, so page URLs have no trailing slash and no `.html` extension.

`.github/workflows/docs.yml` does the publishing:

| Event | Behavior |
|---|---|
| Pull request touching `docs/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` or the workflow | Builds the site and uploads the Pages artifact; no deploy. |
| Push to `main` touching the same paths | Builds, then deploys the artifact to GitHub Pages. |
| Manual dispatch | Same as a push to `main`. |

The build job runs on Node 24 with pnpm from the lockfile (`pnpm install --frozen-lockfile`) and `pnpm docs:build`, then uploads `docs/.vitepress/dist`. The deploy job uses the `github-pages` environment and `actions/deploy-pages`.

For this to work, the repository must have **Settings > Pages > Source** set to **GitHub Actions**. With a branch source instead, the workflow's deployment step will not publish anything.

Write for the reader who has installed Telescreen but not read the code: state what a setting does, what the default is, and what happens after a change.
