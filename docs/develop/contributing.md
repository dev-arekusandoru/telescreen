# Contribute

Telescreen is a small self-hosted project; contributions are welcome as bug reports, focused fixes and documentation improvements. This page explains where to send them and what a reviewable pull request looks like.

## Report a bug

Open an issue at [github.com/dev-arekusandoru/telescreen/issues](https://github.com/dev-arekusandoru/telescreen/issues) and include:

- What you expected, what happened, and the steps that reproduce it.
- Your version: `GET /api/v1/health` returns it, and `git rev-parse --short HEAD` gives the commit you built.
- Whether it reproduces in another browser or on another viewport (the UI changes at 600 px and 1280 px).
- Relevant server logs. The container prints the listening address, the database path and any sync or provider errors.

Remove tokens, OAuth client secrets, app-specific passwords and tailnet hostnames before pasting logs. `Authorization` headers and anything under `account.secret_encrypted` are sensitive.

## Propose a change

For a typo or an obvious one-line fix, open the pull request directly. For anything larger — a new module, a schema change, a new Settings section, a change to calendar write behavior — open an issue first so the approach can be agreed before you spend time on it. The behavior contract is in [SPEC.md](https://github.com/dev-arekusandoru/telescreen/blob/main/SPEC.md).

## Pull request checklist

| Area | Expectation |
|---|---|
| Description | Explain the problem and why this change fixes it, not just what files changed. Link the issue. |
| Scope | One concern per pull request. Refactors that are not needed for the fix belong in their own change. |
| Tests | Add a server test for behavior in `src/`, and a web test next to the feature for UI logic. Bug fixes should come with a test that fails before the fix. |
| Checks | `pnpm typecheck`, `pnpm test:all` and `pnpm build` pass. Run `pnpm e2e` if you touched navigation, the shell, Settings or the calendar event flow. |
| Migrations | A schema change includes the generated `drizzle/NNNN_*.sql` and its metadata from `pnpm db:generate`. |
| API types | An endpoint change includes the regenerated `web/openapi.json` and `web/src/api/schema.d.ts` from `pnpm openapi`. |
| Docs | User-visible changes update the relevant page under `docs/`, using the conventions in [documentation](documentation). |
| Style | Design tokens and CSS modules only, no hard-coded colors. Keep the existing structure instead of introducing a second pattern. |
| Accessibility | Interactive elements are real buttons or links, forms have labels, focus is visible, and touch targets stay large enough for the wall display. |

Keep generated artifacts out of unrelated commits: a regenerated OpenAPI file belongs with the endpoint that changed it.

## Code expectations

- Server code is strict TypeScript (`strict` plus `noUncheckedIndexedAccess`). Put validation in Zod schemas at the route boundary and business rules in `services/`; throw `AppError` rather than inventing response shapes.
- Web code uses TanStack Router and Query, CSS modules and the tokens in `web/src/styles/tokens.css`. New primitives go in `web/src/ui/` next to the existing ones.
- Do not add a dependency for something the standard library or an installed package already does. Say why in the pull request if you add one.
- Tests are part of the change, not a follow-up.

## Commit style

History in this repository uses short, plain subjects, often prefixed with the area, plus a body only when it explains a decision:

```
Travel card: arrival time, traffic status, per-destination icon and person
Settings: tile launcher with header back button, mobile fixes, entrance animations
```

Write an imperative or descriptive subject under about 72 characters, no Conventional Commits prefixes, and no emoji. If a commit needs a paragraph to be understood, that paragraph is welcome in the body.

## Conduct

There is no formal code of conduct file. The expectation is simple: be decent. Assume good faith, critique the change and not the person, and keep discussion focused on the project. Maintainers may close threads or pull requests that turn hostile.

## Questions

Ask in a GitHub issue, or comment on the issue or pull request where the topic already exists. Questions about deploying your own instance belong in [host troubleshooting](../host/troubleshooting); questions about running the code belong in [local setup](setup).
