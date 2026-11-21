# AGENTS.md

Guidance for coding agents working in this repository. Follow existing behavior unless the task explicitly changes it.

## Project

QuranMemoriser is an offline-first Madani Mushaf PWA (Svelte 5 + TypeScript + Vite 8/Rolldown). It renders 604 QCF v1 page-font pages, supports verse selection, search, navigation, bookmarks, and offline recitation.

## Commands

Run from repo root. On Windows PowerShell, prefer `cmd /c "npm run ..."` if script execution is blocked.

```sh
npm run dev
npm run check
npm run lint
npm test
npm run build
npm run test:e2e
npm run data:fetch
npm run data:build
```

`npm run build` runs `prebuild` (`data:fetch && data:build`) before Vite. Generated `public/data/` and `public/fonts/` are gitignored; `.cache/` is source cache.

## Architecture

- `src/lib/domain/` - shared schemas/types (`zod`), domain primitives. Keep domain types framework-agnostic.
- `src/lib/features/<feature>/` - feature slices. A feature owns its UI, model/state, data access, and feature-specific styles.
- `src/lib/pwa/` - service worker registration, update/install status, PWA UI.
- `scripts/` - data fetch/build pipeline; deterministic, validated, offline-cache friendly.
- `tests/unit/` - Vitest unit tests.
- `tests/e2e/` - Playwright E2E tests.

### Feature slice layout

Use this shape when adding or refactoring feature code:

```text
src/lib/features/<feature>/
  components/   # Svelte UI; small, focused components
  model/        # state, commands/use-cases, pure logic
  data/         # repositories, fetch/cache/storage adapters
  *.css         # feature-scoped styles when needed
```

Not every feature needs every folder, but new code should fit this separation.

## Modularity and file size

Avoid large files. **No new or refactored file should approach 900 lines.**

- **Target:** < 300 lines per source file.
- **Soft limit:** 300-400 lines - consider splitting by responsibility.
- **Hard limit:** 500 lines for app source files. Tests/scripts may be larger only when splitting harms readability, but prefer focused files.
- **Refactor trigger:** when touching a large file, extract cohesive seams instead of adding more branches.

Split by responsibility, not by arbitrary line count:

- **Components:** extract presentational subcomponents, dialogs/panels, list items, toolbars, and hooks/helpers into `components/` or `model/`.
- **State/models:** extract pure helpers, command objects, state machines/transitions, and selectors from Svelte/UI files.
- **Repositories/data:** keep fetch/parse/cache/storage separate from UI state.
- **CSS:** split large feature styles by area (`layout`, `sheet`, `selection`, `overlays`) or co-locate component styles when practical; avoid one global dump for feature behavior.

When refactoring, preserve public behavior and add/update tests around the extracted seam.

## Svelte 5 / TypeScript conventions

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) consistently; avoid mixing legacy patterns.
- Keep components focused on rendering and user interaction. Move domain logic, data shaping, and reusable commands into `model/` or `data/`.
- Prefer explicit types/interfaces for props, repository contracts, and command inputs/outputs.
- Use existing path/style conventions and Biome formatting: 2 spaces, double quotes, no semicolons as required, line width 100.
- Do not add `any` or silent type suppressions unless unavoidable; document why.

## Data, repositories, and commands

- Use Repository pattern for data access/caching/storage boundaries. UI should not hardcode fetch/cache details when a repository owns them.
- Keep command/use-case logic testable: inputs, state transitions, and side effects should be clear.
- Prefer established npm libraries over hand-rolled utilities when they fit the existing stack.
- Keep static/runtime asset paths base-aware (`import.meta.env.BASE_URL`) for GitHub Pages/subpath deploys.
- Offline/PWA behavior is core: preserve precache/runtime cache behavior, offline fallbacks, and clear user status.

## Styling

- Preserve the mushaf visual language and RTL/Quran rendering constraints.
- Keep QCF glyph rendering, page-fit sizing, and selection/playback overlays aligned and readable.
- Prefer feature-scoped CSS; avoid leaking feature styles into unrelated areas.
- Reuse existing CSS variables/tokens before adding new ones.

## Testing

- Add/update unit tests for model/repository logic and bug fixes.
- Add/update E2E tests for user-visible flows when behavior changes.
- Run `npm run check`, `npm run lint`, `npm test`, and relevant E2E/build checks before finishing substantial changes.
- For UI regressions, verify the built app when service worker/PWA behavior is involved.

## Git / workflow

- Keep commits local unless the user asks to push.
- Do not revert unrelated user changes.
- `dist/`, `public/data/`, `public/fonts/`, and `.cache/` are generated/ignored as configured; do not commit generated artifacts unless explicitly requested.

## Refactoring checklist

Before adding code to a large file:

1. Identify the responsibility boundary (UI, state, data, formatting, command).
2. Extract a small module/component with a narrow API.
3. Keep imports directional: `components -> model/data/domain`, not the reverse.
4. Add or update tests for the moved behavior.
5. Run check/lint/tests/build as appropriate.
