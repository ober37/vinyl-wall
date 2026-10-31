# Vinyl Wall — setup instructions for Claude

These instructions are written for **Claude** to follow on behalf of the person who asked to set up (or update) a Vinyl Wall. If you are a person, you don't need to read this: paste the prompt from the [README](README.md) into Claude.

Release: **v0.9.6**. All file links below point at this tag. Replace `v0.9.6` only if the person asks for a different version.

```
BASE = https://raw.githubusercontent.com/ober37/vinyl-wall/v0.9.6
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
app/tools/discogs_import.py
app/tools/lookup.py
app/tools/shop_search.py
app/tools/barcodes.py
app/backgrounds/listening-room.jpg
app/backgrounds/crate-digging.jpg
app/backgrounds/record-shop.jpg
app/backgrounds/coffee-shop.jpg
app/backgrounds/coffee-shop-2.jpg
tasks/background-task.md
skills/vinyl-wall/SKILL.md
```

e.g. `curl -fsSL "$BASE/app/vinyl-wall.html" -o app/vinyl-wall.html` for each. Check every file downloaded (non-empty; images are real JPEGs, not HTML error pages). Read `app/vinyl-wall.html` once before publishing it.

## 3. Publish the wall

Publish `app/vinyl-wall.html` as a **new** artifact:

- `icon`: `"music"`
- `files`:
  ```json
  {
    "tools/discogs_sync.py": {"from": "app/tools/discogs_sync.py", "contentType": "text/plain"},
    "tools/discogs_import.py": {"from": "app/tools/discogs_import.py", "contentType": "text/plain"},
    "tools/lookup.py": {"from": "app/tools/lookup.py", "contentType": "text/plain"},
    "tools/shop_search.py": {"from": "app/tools/shop_search.py", "contentType": "text/plain"},
    "tools/barcodes.py": {"from": "app/tools/barcodes.py", "contentType": "text/plain"},
    "backgrounds/listening-room.jpg": "app/backgrounds/listening-room.jpg",
    "backgrounds/crate-digging.jpg": "app/backgrounds/crate-digging.jpg",
    "backgrounds/record-shop.jpg": "app/backgrounds/record-shop.jpg",
    "backgrounds/coffee-shop.jpg": "app/backgrounds/coffee-shop.jpg",
    "backgrounds/coffee-shop-2.jpg": "app/backgrounds/coffee-shop-2.jpg"
  }
  ```
- `capabilities`:
  ```json
  {
    "db": {"rules": [{"path": "", "write": "admin"}]},
    "user": {},
    "assets": {},
    "downloads": true,
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
  "url": "<WALL_URL>",
  "discogs": {},
  "dataVersion": 2
}
```

Then create the person's first setup so the equipment page has a home: `set` `setups` / `main` to `{"name": "My setup", "note": "", "added": <now in ms>}`.

## 6. Verify

1. `get` `settings` / `site` and confirm `taskId` is there.
2. `list` `setups` and confirm one setup exists.
3. Confirm the scheduled task exists (`list_triggers`) and has no schedule.

Report each check in one line. If one fails, fix it once; if it still fails, say what failed.

## 7. Offer the chat skill

`skills/vinyl-wall/SKILL.md` teaches a chat how to add records to the wall (for example, looking up the shop's website). Offer it as one of the person's own skills, the review card they save with one click, and tell them in one sentence what it's for. If they save it, `update` `settings/site` with `{"skillVersion": <the number on its "Skill version" line>}`. If they skip it, or this session can't offer skills, carry on: the wall works without it, and you can give them the file to add under Settings → Skills later.

## 8. Hand over

Tell the person, briefly:

1. Their wall is ready (the publish card has the link). It's private to them.
2. **Add a record** with **Add a record**; leave cover, year and label blank and they're filled in automatically within a few minutes. The first time, the page asks permission to start Claude tasks: allow it.
3. **Connect Discogs (optional):** open **Settings** (gear icon) → enter their Discogs username and a personal access token from discogs.com/settings/developers → **Save token**. The token never needs to go through the chat. If they already keep their records on Discogs, once the connection shows as verified they can tap **Import from Discogs** in Settings to bring their collection and wantlist onto the wall.
4. **Equipment:** tap the Gear pill to add their turntable, cartridge and stylus, and rename "My setup".
5. Backgrounds and the title are under **Settings**.
6. **Adding from a chat:** they can open the wall, start a chat from it and say what they bought, photos welcome; with the skill saved, Claude fills in details like the shop's website.
7. **Moving from another wall?** Tap **Import your library** on the welcome card (or **Settings** → **Your library** → **Import from a file**) and pick the file they saved with **Export your library**. Their records, equipment, setups and the wall's look come across, with covers and album and artist info. Anything the file doesn't carry, like covers in a file from an older wall, is looked up again.

Mention which approval setting the background task got (from the `create_trigger` result) and, if its runs ask for approval, that they can switch it to automatic approval in the task's settings.

---

## Updating an existing wall

When the person asks to update their Vinyl Wall:

The wall's background task checks for new releases (background-task part E), and Settings then shows the owner the sentence to send Claude to run these steps.

1. Find the existing artifact URL (`Artifact` `action: "list"`, or ask). Read it with `Artifact` `action: "read"` before publishing.
2. Download the files for the requested release (step 2).
3. **Update the background task first**, so the new page never starts it with the old prompt. `get` `settings` / `site` to find `taskId`, then `update_trigger` that task with the new `tasks/background-task.md` text (with `{{WALL_URL}}` filled in). If `taskId` is missing or the task no longer exists, create a new one (step 4) and `update` `settings/site` with the new `taskId`.
4. Publish `app/vinyl-wall.html` **to the existing URL** with the same `files`. Omit `capabilities` if the existing artifact already declares exactly the list in step 3 (the read shows what it declares); otherwise pass step 3's list. Never delete or rewrite the person's records, gear, setups, settings or private data.
   Then record the update and clear anything left from older in-app update attempts: `update` `settings/site` with `{"url": "<the artifact URL>", "update": {"latest": "<this version>", "requested": {"__delete__": true}, "requestedAt": {"__delete__": true}, "staged": {"__delete__": true}, "needsChat": {"__delete__": true}, "installing": {"__delete__": true}, "msg": {"__delete__": true}}}` (pin to its version).
   Finally, `get` `settings/site` again: if it has a `run` whose `startedMs` is earlier than when you published, a run with the old prompt slipped in and may never clear it, so `update` with `{"run": {"__delete__": true}}` (pin to its version). Always end an update this way.
5. **Run data upgrades.** Read `dataVersion` from `settings/site` (missing means `1`). Run every upgrade below whose number is higher than that, in order, then `update` `settings/site` with `{"dataVersion": <highest number run>}`. Each upgrade is safe to re-run, but run each only once.

   **Upgrade 2** (from v0.1.x):
   - *Re-match non-vinyl Discogs links.* v0.1.0 could link records to a CD, DVD or single. `list` `records` and, in one `batch`, `update` every document whose `discogsMatch` is exactly `"master main release"` with `{"discogsId": {"__delete__": true}, "discogsMatch": {"__delete__": true}, "needsSync": true}` (pin each to its version). Never touch records with any other `discogsMatch` value; the person chose those. If any were updated, start the background task once (`fire_trigger` with `taskId`): it re-matches them to vinyl and swaps the wrong wantlist entries.
   - *Shrink existing covers.* Older walls stored covers at full size (often 1000px, 100–300 KB). For each record with a `coverAsset` and no `coverOriginal`: read the asset (`Artifact` `action: "read"`, `path` = the asset id), shrink it in Python Pillow so the longest side is at most 500px, save as JPEG quality 82, upload it (`asset: true`), then `update` the record with `{"coverAsset": <new id>, "coverOriginal": <old id>}` (pin to its version; batch the updates). Skip a cover whose shrunk file isn't smaller. Don't delete the originals; `coverOriginal` keeps them recoverable.
6. **Chat skill.** Read the number on the "Skill version" line of the downloaded `skills/vinyl-wall/SKILL.md`. If it's higher than `skillVersion` in `settings/site` (missing means `0`), offer the skill as in setup step 7, saying it replaces their saved copy, and `update` `skillVersion` if they save it. Otherwise skip this.
7. **Unused images (only if the person asks to tidy up).** List the page's assets (`Artifact` `action: "list"`, `scope: "assets"`) and find ids that no record (`coverAsset`, `coverOriginal`) and no setting (`settings/site` `bg.assetId`, `uploads[].id`) refers to. Show them to the person and delete only the ones they approve.
8. Tell the person what changed in one or two lines.

## Removing a wall

Only on an explicit request: delete the scheduled task (`delete_trigger` with `taskId`) and, if they also want the page gone, delete the artifact. Remind them to revoke their Discogs token on discogs.com if they connected one.
