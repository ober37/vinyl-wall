# React + appica-ui rebuild: plan to parity

The plan for rebuilding Vinyl Wall on React 19 and [appica-ui](https://github.com/appica-dev/appica-ui), on the
`prototype/appica-ui` branch. It started as an experiment in moving a UX onto an agent-friendly React component system,
and is now going to full parity with the plain-JS page (v0.9.4). **1.0 on `main` is paused until this lands or is dropped.**

## Decisions

| Decision | Why |
|---|---|
| Full rewrite in React 19 + appica (`web/`), not tokens-only | It's the only way to learn what migrating onto the component system really takes |
| appica re-themed to Vinyl Wall's palette and fonts (`web/src/theme.css`) | Stock appica reads as a generic dashboard; re-theming keeps the wall's identity. `theme.css` is the only file with colour values |
| Rack, sleeves, disc and hang tags are custom CSS on tokens (`web/src/wall/wall.css`) | appica has no component for illustration and texture |
| Record sheet is appica's Drawer from the right, full width on phones | A bottom drawer's swipe-to-close fights scrolling long logs |
| React and appica load from jsdelivr through an import map (`web/cdn-lock.json`, written by `npm run cdn:lock`) | SETUP has Claude read the page before publishing it. Bundled, the page is ~850 KB in 62 lines (about 4x today's tokens, and lines too long to read); with React and appica outside it, it's ~260 KB with readable lines, like today's page. appica, Base UI and Motion load as their own published files (one URL per file, so one copy of their shared state); jsdelivr's per-component bundles each carried a private copy and broke every parent/child pair (filter chips, Log a play, #60). React and other CommonJS packages use jsdelivr's converted builds, pinned to one React. A first visit fetches ~875 small files (a few seconds cold, under a second warm); later visits come from the browser cache. No package of our own is published. `check:cdn` uses the built page in Chrome; `BUNDLE=1` builds the all-in-one fallback |
| The built page replaces `app/vinyl-wall.html` at the same path | SETUP.md and the in-app update keep working unchanged |
| Same data shapes as production; no migration | Existing walls update in place and can roll back |

## Merge bar

1. Every test passes: production's smoke test scenarios ported, plus the React suite and `check:cdn`.
2. `docs/design-checklist.md` passes for every screen.
3. No data migration: a 0.9.4 wall updates to the new page and back with nothing lost.
4. A clear gain beyond looks (accessibility, maintainability, speed of building features).

## Phases

| # | Phase | Status |
|---|---|---|
| — | Spike: React + appica in one page on claude.ai | Done |
| — | Slice 1: wall grid, record sheet view and autosaving edit | Done |
| — | Slice 2: status moves, play log and journal, notes, remove, error boundaries | Done (copy picker and gear minutes deferred) |
| — | Rack slice: re-theme, barnwood rack, sleeves, hang tags, photo background, filter and search | Done (other hanging styles and pattern backgrounds deferred) |
| 0 | Integration: runtime capabilities, background task, Settings (update notice, Discogs token), release plumbing, CDN build | Done: S1–S5 here, P1–P5 on the personal account (#60). Go. SETUP gaps it found: #61 |
| 1 | Add a record, automatic lookup, cover upload | Built: Add a record, lookup dots, cover upload/replace, Not this artist, auto-filled marks; theme follows the system. Welcome card stays in phase 5. Done: tested on the PR, with the album-info re-lookup fix (5550d1e). Remove a cover: #62 |
| 2 | The hunt: priority, copies and the copy picker, budget, search links, Research tab | |
| 3 | Orders, listening stats and badges | |
| 4 | Equipment: gear, setups, play minutes on gear, stylus meter | |
| 5 | Settings in full (title, backgrounds, hanging styles, Discogs import) and the welcome screen | |
| 6 | Discogs import and sync status, share as image, export and import | |
| 7 | Parity audit: port the smoke test scenarios, design checklist, cut over | |

Each phase: the software lead and UX designer agree a design, the owner approves it, it's built with tests, the UX
review signs off the screenshots, then it's published to the test page.

## Phase 0 checks

Done in Claude Code (work account, page only):

- **S1** Real walls through the new code: `VW_SNAPSHOTS=<exported .json files> npx vitest run src/snapshots.test.tsx`
  opens every record in view and edit. Passed on five exports and the test wall's data.
- **S2** The CDN-loaded page runs inside claude.ai. Passed on the test wall.
- **S3** Update a wall to the new page, edit, roll back; the old page reads the new writes. Passed (the test wall is
  back on its own page).
- **S4** The Discogs token the new page saves (`data/users/<id>/discogs`) is read and removed by the old page. Passed.
- **S5** Page size and readability for SETUP. ~245 KB, longest line ~1,100 characters.

On the personal account (has Claude Code Remote), from the draft PR's checklist:

- **P1** New wall from the branch's SETUP.md.
- **P2** Adding a record starts the background task; the cover and details appear live.
- **P3** An invalid Discogs token shows "Not accepted" (no real token is used in testing).
- **P4** A fresh v0.9.4 wall updates to the branch and back, data and task intact.
- **P5** The update notice shows the sentence to send Claude.

## Testing and gotchas

- `dev/test.sh` runs everything: production's Python and smoke tests (against `main`'s page where the branch started),
  the React suite (`tsc`, Vitest), and `check:cdn` (needs the network).
- Real-runtime testing goes through a PR on the personal account, with SETUP pointed at the branch and a new wall.
- Walls keep the runtime contract they were installed with: the page must work without newer capability methods.
- appica: some parts only work inside their parent (`FieldDescription` outside `Field` crashes); `ThemeProvider`
  assumes server rendering (its script is injected into `<head>` at build); `index.css` scans only the components in
  use, and a test keeps that list honest; after adding an appica component or upgrading a package, run `npm run cdn:lock` (the build fails if an import isn't in the lock).
- Tests: explicit Testing Library cleanup, Motion animations off, and an in-memory `localStorage` (Node 25's own one
  shadows happy-dom's), all in `web/src/test-setup.ts`.
