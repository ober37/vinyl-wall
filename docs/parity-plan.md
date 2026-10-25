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
| 2 | The hunt: priority, copies and the copy picker, budget, search links, Research tab | Built: copies under the why (folded rows with their budgets), one-tap copy picker before the paid prompt, priority in edit and on the badge, Research tab (log, Copy for Claude, + Want with Undo, Search elsewhere). Changed from production: shopping links on an owned record only while it still wants a copy; removing a copy with details asks first, and a hunt's only copy can be removed (cleared back to blank); hang tags show priority without the budget. Done: tested on the PR, including a rollback to 0.9.4 and back. Follow-ups: #66, #67 |
| 3 | Orders, listening stats and badges | Built: the order in edit ("The order" under the copy ordered, status as a Select), the Order tab (one open card: status with Track ↗, pressing, label, from, paid or budget, ordered, older order notes, Discogs links), the Listening stats row, badges (most played ever, top this month, 10/50/100 hours) on their own row in the sheet header. Changed from production: the order's note box stays on the Notes tab; the order is an open card, not a folding row; older order notes show in view. The wall-wide Listening summary moves to phase 4 with the Equipment sheet it lives in (its rows open records, so that sheet needs a way to a record sheet). Done: tested on the PR. Follow-up: #68 |
| 4 | Equipment: gear, setups, play minutes on gear, stylus meter, the wall-wide Listening summary | Built: the Equipment sheet (Listening summary, setups, shared, not in a setup, retired) with gear, setup and Add equipment views inside it, gear in view + Edit, plays put minutes on the gear of their setup (Played on with two setups or more) and take them off when deleted or re-dated. A new header from testing: Equipment is a round wear ring first beside Search and Settings (all three with quick tooltips; "Office stylus: Healthy, 298 h remaining"), Add a record is a + held to the right of the filter row, the filter chips are outlined and start on the title's edge, and the "Looking up N records" line became a quiet "Looking up N" at the end of the filter row (owners only). Changed from production: a record opened from the Listening summary has a ‹ Equipment link back; gear details are view + Edit; the Equipment button invites an owner with no gear and is hidden from viewers until there's gear; a first setup starts from Add your turntable, later ones from a dashed + Add another setup; deleting a gear log entry asks first; Add opens the new piece; Replace and Retire ask with a calm confirm and Replace keeps the setup; retired gear shows its hours without a wear verdict; Log play's line names the piece that took the minutes (or the most worn among them, not the whole wall's); a play just logged keeps Undo when its sheet is closed and opened again (production clears it). Done: tested on the test wall, including a rollback to 0.9.4 and back |
| 5 | Settings in full (title, backgrounds, hanging styles, Discogs import) and the welcome screen | Built: Settings has Page (title), Background (13 tiles, upload your own as the grid's last slot, remove with ×, Soften the photo with its preview on the chosen tile), Hanging (Barnwood, Pegs, Cork, Floating), the Discogs import box (Try again after 10 minutes) and Help; the welcome card on an owner's empty wall (Start blank under the steps, Open Settings lands on Discogs). The design checklist gained Spacing and alignment (one gap per level, one left edge). Changed from production: removing the uploaded photo in use goes back to the background it replaced (`bgBefore`); a background start the page makes on its own says nothing when it can't run (only one the owner asked for does); no photo credit lines until real credits exist; viewers of an empty wall see the plain line, not the card. Done: tested on the test wall and a throwaway empty wall |
| 6 | Discogs sync status, share as image, export and import (the Discogs import moved into phase 5) | Done (2026-10-25): the complete re-test passed on the test wall and, with the background task, on a new wall from the branch. 1 done: the runout by side and the Discogs release in edit (in Your copy on owned records, a Discogs section on wanted and ordered), the sync line, Copy runout for a Discogs submission; tested on the test wall. Changed from production: a pasted link becomes its number as it's pasted (anything else says so), the line offers Settings when Discogs isn't connected, an automatic match reads "Matched automatically (…)", an empty field shows only its hint, and any release written without its match clears the old match. 2 done: export and import a library file (Settings → Your library; the import runs step by step inside Settings, keeps going when Settings closes and opens on it, and can try the same file again after a stop; the welcome card offers Import from a file); tested on the test wall and an empty wall. 3 done: share as image, a picture of what the wall shows (filter and search), drawn as the wall draws it (the hanging style's rails, rings, pegs and pins, the sleeves' sway, the photo or pattern background, tags, and captions with year · label), saved as a 2x JPEG; tested on the test wall, phone and desktop. Changed from production: viewers get Share too; no Share on an empty wall or when nothing matches; the buttons sit above the picture; the sheet says when the picture is narrowed ("12 of 40 records, as filtered") and when covers or the photo couldn't be drawn; on a phone that can only save, the button reads "Share or save" with a line saying the download leads to sharing; titles wrap to two lines and the year · label line is in; pattern backgrounds are drawn, not left plain; the cork and felt grain is one tile the wall and the picture share (grain.ts; Safari won't save a canvas that has drawn an SVG). Also from testing: on phones the round buttons sit on their own row above the title (a single overlong word breaks rather than overflowing), and the first row's gap below the header is set per hanging style. Page budget 460 KB until phase 8 (470 KB from phase 7). Follow-up: #71. From the background-task pass (personal account, clean wall): imports, covers, the sync line and syncing back passed; then changed from production: a run that stops early no longer locks the wall (check-ins, 20 minutes without one is a dead run, the import's done mark lands with its records, the sync stops after 10 minutes and the page starts the next run for what's left), the import reads back the notes the sync wrote (priority, target, budget, orders, an owned copy's pressing, runout, shop, date and price), an edit waiting for Discogs shows the lookup dot and count ("Waiting to sync…" in the sheet; a library load's records are checked quietly), and a release number typed in records "set by you". Also from testing: the wall's busy count reads "1 syncing" for lookups and syncs alike. |
| 7 | Parity audit: port the smoke test scenarios, design checklist | In progress. 1 done (2026-10-25): the parity map (`docs/parity-map.md`) checks 256 production behaviours and the smoke test's 43 scenarios against the React page: 137 tested, 43 built but untested, 48 recorded departures, 18 unrecorded differences, 10 missing. Owner's decisions: build every missing piece (About the artist, designed first; Discogs links under Your copy; tracklist side headings and its source line; the Example label; "Looking it up…" in the runtime field; "Removed. Taking it off Discogs too."; the play icons ● ◐ ◔; the `claude:viewport-fit-sides` meta; hidden scroll bars on touch). Change back to production: the tab title before the wall loads, no Search on an empty wall, "…with this filter", Recorded's dates on their own line, Your copy's runout folded behind "N sides · Cat. X", Copy runout for a Discogs submission with a runout alone (and the text selected when the clipboard is blocked), "N h to go" on gear cards, Add time on retired gear, "Try again to restart it.", "Couldn't load the wall:". Recorded as departures: the lookup line in the header (not where the summary goes, and not after Find cover & details), the status move's line in view too, a Notes tab for editors on every record, no cover upload button where files can't be stored, removing research asks first, the vibe behind Set the vibe, the Listening summary's hint says "log a play". Next: 2 port the untested scenarios, 3 build the gaps, 4 the design checklist pass |
| 8 | Size and speed before cutover: tighten the page (e.g. Tailwind's older-browser `color-mix` copies, ~90 blocks) and first-visit load, bring `check:cdn`'s budgets back down, then cut over | |

Each phase: the software lead and UX designer agree a design, the owner approves it, it's built with tests, the UX
review signs off the screenshots, `/code-review` and `/simplify` run on the phase's diff (findings fixed or noted in the
PR comment), then it's published to the test page. From phase 4 on.

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

- CI (`.github/workflows/test.yml`) runs `dev/test.sh` on every push. `check:cdn` also fails over its budgets (page size,
  longest line outside the import map, first-visit files, time until the wall shows; `BUDGET` in `web/scripts/check-cdn.mjs`).
- `dev/test.sh` runs everything: production's Python and smoke tests (against `main`'s page where the branch started),
  the React suite (`tsc`, Vitest), and `check:cdn` (needs the network).
- Real-runtime testing goes through a PR on the personal account, with SETUP pointed at the branch and a new wall.
- Walls keep the runtime contract they were installed with: the page must work without newer capability methods.
- appica: some parts only work inside their parent (`FieldDescription` outside `Field` crashes); `ThemeProvider`
  assumes server rendering (its script is injected into `<head>` at build); `index.css` scans only the components in
  use, and a test keeps that list honest; after adding an appica component or upgrading a package, run `npm run cdn:lock` (the build fails if an import isn't in the lock).
- Tests: explicit Testing Library cleanup, Motion animations off, and an in-memory `localStorage` (Node 25's own one
  shadows happy-dom's), all in `web/src/test-setup.ts`.
