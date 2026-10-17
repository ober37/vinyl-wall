# Vinyl Wall — setup instructions for Claude

These instructions are written for **Claude** to follow on behalf of the person who asked to set up (or update) a Vinyl Wall. If you are a person, you don't need to read this: paste the prompt from the [README](README.md) into Claude.

Release: **v0.1.0**. All file links below point at this tag. Replace `v0.1.0` only if the person asks for a different version.

```
BASE = https://raw.githubusercontent.com/ober37/vinyl-wall/v0.1.0
```

---

## 0. Ground rules

- **Never ask for the Discogs token in chat.** The person enters it in the wall's Settings, which stores it in their private, per-user space on the page. If they paste a token into the chat anyway, don't repeat it, don't store it anywhere, and suggest they regenerate it on Discogs and enter the new one in Settings.
- Tell the person in one sentence what you're about to do, then do it. Ask only for the wall's title (optional) unless something fails.
- Everything you create belongs to the person: their own private page, their own data, their own background task. Nothing is shared with the author of this project.

## 1. Check the tools this needs

You need all of these. Load deferred tools with ToolSearch if needed.

| Need | Tool |
|---|---|
| Publish a page with runtime capabilities and supporting files | `Artifact` (publish with `capabilities` and `files`) |
| Write the page's database | `ArtifactData` |
| Create an on-demand background task | `create_trigger` (and `update_trigger` for updates) from the Claude Code Remote tools |
| Download files and run Python | a shell (`Bash`) with network access to `raw.githubusercontent.com` |

If any is missing, stop and tell the person plainly which capability their Claude setup is missing (for example, "this session can't create scheduled tasks"), and that the wall needs it. Don't build a partial install.

If the person already has a Vinyl Wall (check `Artifact` `action: "list"` for an artifact titled "Vinyl Wall" or with their custom title, or ask), go to **Updating** at the end instead.

## 2. Download the files

Make a fresh, empty directory and download into it (keep the same relative paths):

```
app/vinyl-wall.html
app/tools/discogs_sync.py
app/backgrounds/listening-room.jpg
app/backgrounds/crate-digging.jpg
app/backgrounds/coffee-shop.jpg
app/backgrounds/coffee-shop-2.jpg
tasks/background-task.md
```

e.g. `curl -fsSL "$BASE/app/vinyl-wall.html" -o app/vinyl-wall.html` for each. Check every file downloaded (non-empty; images are real JPEGs, not HTML error pages). Read `app/vinyl-wall.html` once before publishing it.

## 3. Publish the wall

Publish `app/vinyl-wall.html` as a **new** artifact:

- `icon`: `"music"`
- `files`:
  ```json
  {
    "tools/discogs_sync.py": {"from": "app/tools/discogs_sync.py", "contentType": "text/plain"},
    "backgrounds/listening-room.jpg": "app/backgrounds/listening-room.jpg",
    "backgrounds/crate-digging.jpg": "app/backgrounds/crate-digging.jpg",
    "backgrounds/coffee-shop.jpg": "app/backgrounds/coffee-shop.jpg",
    "backgrounds/coffee-shop-2.jpg": "app/backgrounds/coffee-shop-2.jpg"
  }
  ```
- `capabilities`:
  ```json
  {
    "db": {},
    "user": {},
    "assets": {},
    "sample": {},
    "mcp": {"servers": [{"server": "Claude Code Remote", "tools": ["fire_trigger"]}]}
  }
  ```
- `description`: "Album covers hanging on a rack: your vinyl collection, wishlist, listening log and gear."

Keep the returned artifact URL: this is `WALL_URL`.

## 4. Create the background task

Read `tasks/background-task.md`, replace every `{{WALL_URL}}` with the artifact URL, and create a scheduled task with:

- `name`: `Vinyl Wall: covers, details and Discogs sync`
- `prompt`: the filled-in text
- **no** `cron_expression` and **no** `run_once_at` (it only runs when the page starts it)
- `notifications`: `{}`
- `initiation`: `human_request`

Keep the returned task id (`trig_…`): this is `TASK_ID`.

## 5. Write the starting settings

With `ArtifactData`, `set` the document `settings` / `site` on `WALL_URL`:

```json
{
  "title": "<the person's chosen title, or My Vinyl Wall>",
  "bg": {"kind": "preset", "preset": "listening"},
  "dim": 55,
  "uploads": [],
  "taskId": "<TASK_ID>",
  "discogs": {}
}
```

Then create the person's first setup so the equipment page has a home: `set` `setups` / `main` to `{"name": "My setup", "note": "", "added": <now in ms>}`.

## 6. Verify

1. `get` `settings` / `site` and confirm `taskId` is there.
2. `list` `setups` and confirm one setup exists.
3. Confirm the scheduled task exists (`list_triggers`) and has no schedule.

Report each check in one line. If one fails, fix it once; if it still fails, say what failed.

## 7. Hand over

Tell the person, briefly:

1. Their wall is ready (the publish card has the link). It's private to them.
2. **Add a record** with **Add a record**; leave cover, year and label blank and they're filled in automatically within a few minutes. The first time, the page asks permission to start Claude tasks: allow it.
3. **Connect Discogs (optional):** open **Settings** (gear icon) → enter their Discogs username and a personal access token from discogs.com/settings/developers → **Save token**. The token never needs to go through the chat.
4. **Equipment:** tap the Gear pill to add their turntable, cartridge and stylus, and rename "My setup".
5. Backgrounds and the title are under **Settings**.

Mention which approval setting the background task got (from the `create_trigger` result) and, if its runs ask for approval, that they can switch it to automatic approval in the task's settings.

---

## Updating an existing wall

When the person asks to update their Vinyl Wall:

1. Find the existing artifact URL (`Artifact` `action: "list"`, or ask). Read it with `Artifact` `action: "read"` before publishing.
2. Download the files for the requested release (step 2).
3. Publish `app/vinyl-wall.html` **to the existing URL** with the same `files`. Omit `capabilities` unless the release notes say they changed. Never delete or rewrite the person's records, gear, setups, settings or private data.
4. `get` `settings` / `site` to find `taskId`, then `update_trigger` that task with the new `tasks/background-task.md` text (with `{{WALL_URL}}` filled in). If `taskId` is missing or the task no longer exists, create a new one (step 4) and `update` `settings/site` with the new `taskId`.
5. Tell the person what changed in one or two lines.

## Removing a wall

Only on an explicit request: delete the scheduled task (`delete_trigger` with `taskId`) and, if they also want the page gone, delete the artifact. Remind them to revoke their Discogs token on discogs.com if they connected one.
