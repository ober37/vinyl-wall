# Working on Vinyl Wall

Notes for anyone, person or Claude, picking up an issue.

## Guiding principle

Vinyl Wall runs inside Claude, so a one-off question or fix is something to ask Claude in chat, not a feature to build. Build into the page only what you'd do again and again, or what should happen without being asked. See [docs/ROADMAP.md](docs/ROADMAP.md).

## How it fits together

| Piece | What it does |
|---|---|
| `app/vinyl-wall.html` | The whole wall: one self-contained page published as a claude.ai artifact. It uses the artifact runtime (`window.claude.use(...)`): `db` (shared database), `user` (who's viewing), `assets` (cover and background uploads), `sample` (asks Claude for research), `downloads` (hands the owner their exported library) and `mcp` (starts the background task with `fire_trigger`). |
| Database | `records` (one doc per album), `settings/site` (title, background, `discogs`, `update`, `taskId`, `dataVersion`), `gear` and `setups` (equipment), and the private `data/users/<id>/discogs` doc that holds the Discogs token. Only the owner and Editors can write (the `db` rules in SETUP.md step 3); everyone the wall is shared with can read the shared docs. |
| `tasks/background-task.md` | The prompt of each owner's on-demand background task (a scheduled task with no schedule). Parts run in order: B verify Discogs, D import, A covers and details, C sync, E updates. The page starts it and says what's waiting (`pendingWork()`). |
| `app/tools/*.py` | Scripts the background task runs: `discogs_sync.py` (wall → Discogs) and `discogs_import.py` (Discogs → wall). They're published with the page and read back by the task. |
| `SETUP.md` | What Claude follows to install or update a wall. In-app updates run its "Updating" steps unattended. |

The page can't reach outside websites. Anything that needs the network (covers, Discogs, shop stock, GitHub) is a background-task job: the page writes a request to the database and starts the task, the task does the work and writes the result back, and the page shows it.

## Rules

- **The Discogs token is a secret.** Only the owner types it, into Settings. It lives only in the private doc. The page never reads it back, and the task handles it only through a chmod-600 temp file and an environment variable. Never log, print or store it anywhere else.
- **Nothing personal in the repo or in issues.** No wall URLs, task ids, usernames, collections or tokens. Use the sample data in `dev/mock.js`.
- **Never rewrite a person's data in an update.** Changes to stored data go in a numbered data upgrade in SETUP.md (`dataVersion`), safe to re-run.
- **Keep the page one file.** Markup, styles and script stay in `app/vinyl-wall.html`.

## Testing a change

1. `python3 dev/build.py`, then `python3 -m http.server 8765 -d dev`, and open `http://localhost:8765/preview.html`. URL flags pick scenarios; see the top of `dev/mock.js`.
   To try a change with a real collection, put a wall snapshot (records, gear, setups and settings as one JSON file, `{"settings": {"site": {...}}, "setups": {...}, "gear": {...}, "records": {...}}`) in `dev/` and add `?data=<file name>`. Snapshots hold personal data: they're git-ignored, so never commit one.
   Run `dev/test.sh` before opening a PR: a headless smoke test of the core flows (filter, search, adding equipment, import) and the 0.9.1 security fixes. It needs Chrome; set `CHROME` if it isn't in the usual macOS place. Add a check to `dev/test.html` when you fix a bug.
2. Go through [docs/design-checklist.md](docs/design-checklist.md) for every screen you touched: view and edit, each record status, empty and full, phone (390px) and desktop, light and dark.
3. For Python scripts, run them against a folder of sample record JSON files with the network calls stubbed. Never test against a real Discogs account without its owner.
4. Changes to the background task can only be tested on a real wall. Use a separate test wall (set one up with SETUP.md), never the owner's own; to fill it from a snapshot, write each document with `ArtifactData` (`batch`, `set`, collection and doc id as in the file). Don't connect the owner's real Discogs account to a test wall. Describe in the PR what to check.

## Releasing

Bump `VERSION` and `APP_VERSION` in `app/vinyl-wall.html` to the same number, and update the version in the README and SETUP.md links. Pushing that to `main` tags and publishes the release automatically (`.github/workflows/release.yml`, which refuses to release if the two numbers differ). Walls with in-app updates then show "An update is available" in Settings. with the sentence to send Claude, who runs SETUP.md's update steps. (Background runs aren't allowed to replace a published page or stage code for the page to install over itself, so installing always goes through Claude in chat.)
