# Vinyl Wall

A record wall for your vinyl collection, built to run in [Claude](https://claude.ai).

Your records hang on a rack with their real album covers. Keep a wishlist of the ones you're hunting, track orders on the way, write notes and a listening log for each album, and log wear on your turntable, cartridge and stylus. Optionally, keep it all in sync with your Discogs collection and wantlist.

**0.9.7 is the latest 1.0 beta: every pressing of an album on one record.** Everything planned for 1.0 is in. Try it and [tell us what works and what doesn't](https://github.com/ober37/vinyl-wall/issues/new/choose) before 1.0.

![Vinyl Wall in dark mode](docs/screenshots/wall-dark.png)

## Set it up

Paste this into a new Claude conversation:

> Set up a Vinyl Wall for me by following the instructions at https://raw.githubusercontent.com/ober37/vinyl-wall/v0.9.7/SETUP.md

Claude publishes the wall as your own private page, creates the background task that finds covers and syncs Discogs, and walks you through the rest. It takes a few minutes. Your records, notes and settings belong to your account only; nothing is shared with this project. If you share your wall, people can see everything on it, prices, orders and notes included, but only you and people you make Editors can change it.

**Updating.** When a new version is out, a dot appears on the wall's Settings button and Settings says an update is available. Settings shows a sentence to send Claude, with a Copy button; paste it into a chat and Claude updates the wall. Your records and settings stay as they are. (Walls set up before in-app updates existed need one manual update: ask Claude *"Update my Vinyl Wall using https://raw.githubusercontent.com/ober37/vinyl-wall/v0.9.7/SETUP.md"*, with the newest version number.)

### What your Claude setup needs

- Published pages (artifacts) with saved data and runtime capabilities
- Scheduled tasks (the wall starts its background task on demand; it doesn't run on a timer)
- Code execution with web access to `raw.githubusercontent.com`, Deezer, iTunes, MusicBrainz and Discogs

If something's missing, Claude tells you before building anything.

## Features

- **The wall.** Every record hangs on the wall, from iron rings on a weathered barnwood plank, wooden pegs, push pins on cork, or floating (Settings → Hanging): what you own, then orders on the way by expected arrival, then the hunt by priority. Tags show each record's status, and tapping the counts under the title filters the wall to one or more of them. Search by title, artist, label or year to find a record fast. Open a sleeve for its record sheet: the album and artist from Wikipedia with the artist's official links, every pressing you have or want, and its listening, notes and research in tabs.
- **The hunt.** A wishlist with priorities (Top want, Want, Someday) and the copies you want, each a pressing with its own budget, the shop pages that sell it, and its release date if it's a pre-order. Your shops, local and online (Settings → Shops; Revolver, Amazon, Discogs Marketplace and eBay to start), each one click from a record, searching for the album or, by barcode, the exact pressing. Research in your Claude chat checks your shops first, searches the web and saves what it finds to the record; pin what's worth keeping.
- **Automatic details.** Add just an artist and album: the cover, year, label and runtime are looked up for you.
- **Your copies.** Every pressing of an album you own lives on one record, each with its grades, catalog number, matrix/runout, where you bought it, what you paid, and its own tracklist and runtime. Own one pressing while you hunt for or order another.
- **Orders.** Store, order number, status, expected date, carrier and tracking link, for a new record or another pressing of one you own. "It arrived" moves it to the wall.
- **Listening log.** Log a whole album, one side or a few tracks, on the copy you played, with a note and a vibe. Plays, hours and badges for your most played records, plus dated notes per record.
- **Equipment.** Turntables, cartridges, styluses, speakers and more, grouped into setups (e.g. Office, Living room) with shared gear. Plays add hours to the right gear; styluses warn you as they approach their rated life.
- **Discogs sync (optional).** Owned records go to your Discogs collection with grades and notes; the hunt and orders go to your wantlist. Already on Discogs? Import your collection and wantlist in one tap.
- **From a chat.** Save the Vinyl Wall skill to your Claude account, then add records from photos of the sleeve, research a pressing, find record shops near you, or merge two records of one album.
- **Your library in a file.** Export everything to a file, and import it into a wall.
- **Make it yours.** Rename the wall and pick a background: photos of a listening room, record shops, a coffee shop or a tavern, softened as much as you like, or patterns like speaker grille and walnut paneling. Or upload your own.
- **Easy updates.** Settings tells you when a new version is out and what to send Claude.
- Works on phones, and in light and dark mode.

| | |
|---|---|
| ![A record's sheet](docs/screenshots/record.png) | ![Equipment](docs/screenshots/equipment.png) |
| ![Settings and backgrounds](docs/screenshots/settings.png) | ![Light mode](docs/screenshots/wall-light.png) |

## Problems and ideas

[Open an issue](https://github.com/ober37/vinyl-wall/issues/new/choose) to report something that isn't working or suggest an idea. There's also a link at the bottom of the wall's Settings. Issues are public, so never include your Discogs token.

## Your Discogs token

Discogs sync uses a personal access token (Discogs → Settings → Developers → Generate new token). Enter it in the wall's **Settings**, never in the chat.

- It's saved in your **private per-user space** on the page. People you share the wall with can't read it, and it isn't stored in the page, with your records, or in the background task's instructions.
- The page can save or delete it but never shows it again; only the last four characters appear.
- Only the background task reads it, passes it to the sync script through an environment variable, and deletes its temporary copy when done.
- Revoke it on Discogs at any time.

The sync only writes to *your* collection and wantlist, and the import only adds records to your wall; it never changes ones already there. It never deletes collection items it didn't add, and it can't edit Discogs' shared release database (the Discogs API doesn't allow that); the record sheet has a button to copy your runout notes for a manual Discogs submission.

## What's in this repo

| Path | What it is |
|---|---|
| `app/vinyl-wall.html` | The wall itself: one page, built from `web/` |
| `web/` | The page's source (React and appica-ui) |
| `app/tools/discogs_sync.py` | One-way sync from the wall to your Discogs collection and wantlist |
| `app/tools/discogs_import.py` | One-time import of an existing Discogs collection and wantlist onto the wall |
| `app/tools/barcodes.py` | Keeps each copy's barcodes from its Discogs release, so a shop's barcode page opens that pressing |
| `app/tools/shop_search.py` | Finds the search link of each of your shops, so Search elsewhere searches the shop for the album |
| `app/tools/lookup.py` | Looks up covers, details and album and artist info for new records, a few at a time |
| `app/backgrounds/` | The photo backgrounds |
| `tasks/background-task.md` | Instructions for the background task (covers, runtimes, Discogs) |
| `skills/vinyl-wall/SKILL.md` | A Claude skill for adding records, research, shops and merging records from a chat; setup offers to save it to your account |
| `SETUP.md` | Step-by-step instructions Claude follows to install or update a wall |

## Credits and licenses

- **Code** (everything except the photos): [MIT](LICENSE).
- **Background photos** in `app/backgrounds/`: **non-commercial use only**. See [NOTICE.md](NOTICE.md). If you use this project commercially, replace them.
- Album information and cover art come from Deezer, iTunes and MusicBrainz / Cover Art Archive, and remain their owners' property.
- Vinyl Wall isn't affiliated with Anthropic or Discogs.
