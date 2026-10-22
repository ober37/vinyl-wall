---
name: vinyl-wall
description: Add or update records on the person's Vinyl Wall (a published artifact) from a chat, often from photos of the record. Use whenever they ask to add, hang, log or change a record, an order or a wanted album on their wall.
---

# Adding records to a Vinyl Wall

Skill version 1.

The wall is a published artifact. Its records are documents in the page's `records` collection, read and written with `ArtifactData` on the wall's URL. If the chat wasn't started from the wall, find it with `Artifact` `action: "list"` (titled "Vinyl Wall" or the person's own title), or ask.

## A new record

`set` a new document in `records` with a fresh random id (20 letters and digits), shaped like the wall's own Add a record:

- `title`, `artist`: required.
- `status`: `"own"` (they have it), `"ordered"` (on its way) or `"wish"` (hunting for it).
- `notes`: `[]`. `added`: now in milliseconds. `priority`: `2` (on a wish, `1` is Top want and `3` is Someday).
- `needsEnrich: true`, so the wall looks up the cover, year, label and album info. Leave `coverAsset`, `year` and `label` to that lookup unless the person gives them.
- Owned: `acquired` (`YYYY-MM-DD`), `paid` (a number as text, `"48"`), `shop`, `shopUrl`, `pressing`, `mediaGrade`, `sleeveGrade`.
- Ordered: `shop`, `shopUrl`, `paid`, `orderDate`, `eta` (`YYYY-MM-DD`), `orderStatus` (`"preorder"`, `"ordered"`, `"shipped"` or `"delayed"`), `orderNum`, `carrier`, `tracking`.
- Wish: `pressing`, `budget`.

Write only what the person said or the photos show; leave the rest out. Before adding, `list` `records` and check it isn't already there (same artist and title); if it is, ask whether this is another copy or a change to the one there.

To change a record, `update` only the fields that change.

## The shop's website

When the person names the shop they bought or ordered a record from (`shop`) but gives no website, look the shop's website up and save it in `shopUrl` as a full `https://` link. If the name could be more than one shop (a common name with several matches), ask which one they mean instead of guessing. Never save a link that isn't http(s).

## When you're done

Tell the person in a line or two what you added, including anything you looked up (like the shop's website), and that the cover and album info fill in shortly.
