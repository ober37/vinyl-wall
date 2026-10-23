---
name: vinyl-wall
description: Add or update records on the person's Vinyl Wall (a published artifact) from a chat, often from photos of the record. Use whenever they ask to add, hang, log or change a record, an order or a wanted album on their wall.
---

# Adding records to a Vinyl Wall

Skill version 4.

The wall is a published artifact. Its records are documents in the page's `records` collection, read and written with `ArtifactData` on the wall's URL. If the chat wasn't started from the wall, find it with `Artifact` `action: "list"` (titled "Vinyl Wall" or the person's own title), or ask.

## A new record

`set` a new document in `records` with a fresh random id (20 letters and digits), shaped like the wall's own Add a record:

- `title`, `artist`: required.
- `status`: `"own"` (they have it), `"ordered"` (on its way) or `"wish"` (hunting for it).
- `notes`: `[]`. `added`: now in milliseconds. `priority`: `2` (on a wish, `1` is Top want and `3` is Someday).
- `needsEnrich: true`, so the wall looks up the cover, year, label and album info. Leave `coverAsset`, `year` and `label` to that lookup unless the person gives them.
- The pressing, often from photos of the record: `pressing` (e.g. "2015 Analogue Productions 45rpm reissue"), `label`, `catalog` (the catalog number), `discogsId` (the Discogs release number, as a number) and `matrix`, the runouts as `"Side A: <runout> · Side B: <runout>"`, one entry per side, joined by " · ".
- Owned: `acquired` (`YYYY-MM-DD`, only when they give a date or say today; otherwise leave it out), `paid` (a number as text, `"48"`), `shop`, `shopUrl`, `mediaGrade`, `sleeveGrade`.
- Ordered: `copyName` (a short name for the copy, like "MoFi one-step"), `shop`, `shopUrl`, `paid`, `orderDate`, `eta` (`YYYY-MM-DD`), `orderStatus` (`"preorder"`, `"ordered"`, `"shipped"` or `"delayed"`), `orderNum`, `carrier`, `tracking`.
- Wish: `copyName`, `budget`.

Write only what the person said or the photos show; leave the rest out. Before adding, `list` `records` and check it isn't already there (same artist and title); if it is, ask whether this is another copy or a change to the one there.

If a shop listing shows a release date still to come (a pre-order), ask whether they have it in hand before adding it as owned rather than ordered.

To change a record, `update` only the fields that change, plus `needsSync: true` so the change reaches Discogs (an order that arrives moves from the wantlist to the collection).

## An order that arrived

When they say an ordered record arrived, `update` it the way the wall's It arrived does:

- `status: "own"`, `orderStatus: "delivered"`, `needsSync: true`.
- `acquired`: the date, under the same rule as a new record (today when they say it came today).
- `notes`: the existing notes plus `{"d": "<today, YYYY-MM-DD>", "t": "Arrived from <shop>. Hung it on the wall."}` (just `"Arrived. Hung it on the wall."` when it has no `shop`).
- Grades, as below.

## The shop's website

When the person names the shop they bought or ordered a record from (`shop`) but gives no website, look the shop's website up and save it in `shopUrl` as a full `https://` link. Never save a link that isn't http(s).

- **Several matches:** ask which shop they mean only when the matches have different websites (the same name in two towns). A chain with several stores and one website (Amoeba: amoeba.com) needs no question.
- **Not sure:** if you can't find the website with confidence, save `shop` only, leave `shopUrl` out, and say so; they can add it in Edit.

## Grades

When you add a record they own, or an order arrives, set `mediaGrade` (vinyl) and `sleeveGrade` (sleeve). Use one of `M`, `NM`, `VG+`, `VG`, `G+`, `G`, `F` or `P`.

- **Clearly new:** the photos show it sealed, they say it's new or sealed, or the shop listing is for a new copy. "Just bought" or "bought today" gives the date, not the condition. Set both to `"M"` without asking, and say so in your reply.
- **Used, or you can't tell:** ask for the vinyl and sleeve grades before writing them, or let them skip. Never assume Mint for a used record.

## When you're done

Tell the person in a line or two what you added, including anything you looked up (like the shop's website) or couldn't find. The wall looks up the cover and album info itself, starting the next time it's opened, so say they'll fill in after they open the wall.
