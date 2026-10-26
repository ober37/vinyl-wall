---
name: vinyl-wall
description: Add, update or research records on the person's Vinyl Wall (a published artifact) from a chat, often from photos of the record. Use whenever they ask to add, hang, log or change a record, an order or a wanted album on their wall, or to research one of its records and save what you found. Also use it to add, find or change the record shops the wall checks first ("find record shops near me").
---

# Adding records to a Vinyl Wall

Skill version 13.

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
- Wish: `copyName`, `budget`, `buyLinks` (see Where to buy a copy).

Write only what the person said or the photos show; leave the rest out. Before adding, `list` `records` and check it isn't already there (same artist and title); if it is, ask whether this is another copy or a change to the one there.

Ask either/or questions as a yes/no where you can ("Is it new or sealed?", not "New or used?"), so a "yes" is never ambiguous.

If a shop listing shows a release date still to come (a pre-order), ask whether they have it in hand before adding it as owned rather than ordered.

To change a record, `update` only the fields that change, plus `needsSync: true` so the change reaches Discogs (an order that arrives moves from the wantlist to the collection).

## Where to buy a copy

Each copy they want can keep the shop pages where that exact copy is sold: `buyLinks`, a list of `https://` addresses. The first copy's is the record's own `buyLinks`; each other copy's is on its entry in `moreCopies`. When they give you a shop page for a copy, `get` the record, add the link to that copy's `buyLinks` (skip it if it's already there), and `update` with `if_version`.

When they point at links in a note, move each link onto the copy it's for, asking which copy when it's unclear. A link for a variant that isn't one of their copies yet: ask whether to add it as a copy they want (append it to `moreCopies` with its `buyLinks`, and add `needsSync: true`). Leave the note as it is unless they ask you to change it.

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

## Their shops

The wall keeps the person's preferred shops as `shops` on the `settings/site` document. The wall's Search elsewhere lists them, and research checks them first. When `shops` is missing, the wall uses these defaults; the first time you change the list, write the defaults with your change so none of them is lost:

```json
[{"id": "revolver", "name": "Revolver", "kind": "online", "url": "https://shop.revolvermag.com/", "search": "https://shop.revolvermag.com/search?q={q}"},
 {"id": "amazon", "name": "Amazon", "kind": "online", "url": "https://www.amazon.com/", "search": "https://www.amazon.com/s?k={q}%20vinyl&i=popular"},
 {"id": "discogs", "name": "Discogs Marketplace", "kind": "market", "url": "https://www.discogs.com/sell", "search": "https://www.discogs.com/sell/list?q={q}&format=Vinyl"},
 {"id": "ebay", "name": "eBay", "kind": "market", "url": "https://www.ebay.com/", "search": "https://www.ebay.com/sch/i.html?_nkw={q}%20vinyl%20LP&_sacat=176985"}]
```

Each shop has:

- `id`: a fresh random id of 10 letters and digits.
- `name`.
- `kind`: `"local"` for a shop they can walk into (even one with a web store; it stays one shop), `"online"` for an online shop with its own stock, or `"market"` for a marketplace of many sellers, like eBay.
- `url`: its website or web store, as an `https://` link.
- `search`: its search page with `{q}` where the artist and album go, `https://` only, like `https://shop.revolvermag.com/search?q={q}`. Find it by searching the shop's site for an album, and check that the link works before saving it.
- For a local shop only, also:
  - `place`: the street address with the town, like "1532 N Milwaukee Ave, Chicago, IL 60622".
  - `phone`.
  - `email`: only an address the shop publishes.
  - `about`: one or two sentences on what makes it worth the trip, like what it's known for. Leave out opening hours, because they change.

Leave out anything you can't find. To change the list, `get` `settings/site`, then `update` it with the whole `shops` list and `if_version`.

- **Adding a shop:** look it up: the website, the search link, and for a local shop the address, phone, email and about. Skip it if a shop with that name is already on the list. Tell them in a line what you added and what you couldn't find.
- **Finding shops near them:** when they ask for record shops near a place (a ZIP code, town or neighborhood), search the web. List up to 8 shops, nearest first. For each, give its town, one line about it, and whether its stock can be searched online (a web store you can search for an album). Ask which ones to add, and add only the ones they pick, as local shops. That includes shops without online stock, which you save with no `url` or `search`; the wall shows those with call, email and map links.
- **Removing a shop:** take it out of the list.

## Research

The wall's Research section hands the person a prompt like this, which they paste with their question at the end:

```
Research a record on my Vinyl Wall
Record: "<title>" by <artist> (record <id>)
Wall: <wall URL>
Use the vinyl-wall skill, and save a summary to the record when we're done.

My question: …
```

The `Wall:` line can be missing; then find the wall as for a new record. When the prompt gives a record id, `get` that record directly, with no `list` or duplicate check. Otherwise find the record by artist and title, and ask if there's more than one.

- **Answer the question asked.** `get` the record first for context (its pressing, notes and `about`). Search the web for anything recent or factual, such as awards, charts, prices or pressing details, rather than answering from memory. Keep it short and give your sources.
- **Finding or buying a copy:** when the question is about finding or buying a copy (which pressing to hunt, where it's available, what it costs), check their shops first.
  - **Order:** `get` `settings/site` for `shops` (if it's missing, use the defaults above). Check local shops first, then online shops, then marketplaces.
  - **Matching:** look up the album at each shop that has a `search`, and match only this album by this artist on vinyl. Skip CDs, tapes, merch and other albums.
  - **Shopify stores (like Revolver):** they have structured data. `<shop>/search/suggest.json?q=<artist title>&resources[type]=product` lists matching products with `available`, `price` and `url`. `<shop>/products/<handle>.json` gives each variant's `price` and `available`.
  - **What to report:**
    - A shop: what's in stock (format, colour variant, price, link), and anything sold out or on pre-order.
    - A marketplace: how many listings and the price range.
    - A local shop whose stock isn't online: say they can call or email to ask.
  - **Exclusive variants:** an exclusive variant ("Limited to 200", a colour) is a pressing in its own right. Name it that way so it can be added as a copy.
  - **Sources:** cite product pages.
  - **Writing it up:** lead with the shops that have it, and sum up the rest in one line ("Nothing at Amazon or eBay"). Then cover other places on the web as usual.
- **Nothing found:** say so in one line. Don't pad the answer with things they didn't ask about, like what their copy is worth, unless they ask.
- **Saving:** when they seem done, ask once whether to save it to the record, and save only if they say yes. A follow-up prompt (starting `Follow up on my research from <date>: "<headline>"`, ending `My follow-up: …`) names an earlier entry: read it from `researchLog` first, and save the follow-up as a new entry.

- **A pressing worth hunting** (wanted records, `status: "wish"`): when you recommend one, ask once whether to add it to the copies they want ("Add the 2019 half-speed to the copies you want?"), and add it if they say yes, as below.

To add a copy they want, `get` the record and skip it if one of its copies already has that pressing or Discogs release. The record's own fields are its first copy: if `copyName`, `pressing`, `catalog`, `budget` and `discogsId` are all empty, fill those (`copyName` for the name). Two things don't count as a copy they chose: a `label` listed in `autoFilled` (looked up for the album), and a `discogsId` the wall's sync matched by itself, which it marks with a `discogsMatch` of exactly `"master main release"`, `"vinyl: master main release"`, `"vinyl: earliest original pressing"`, `"vinyl: first matching release"`, `"catalog"` or `"catalog+pressing"`. Any other `discogsMatch` (an import, or a release someone confirmed) is a copy they chose. When you fill the first copy over a matched release, replace `discogsId` with the release you found (or `""`) and set `discogsMatch` to `""`. Otherwise append `{"name", "pressing", "label", "catalog", "budget", "discogsId"}` to `moreCopies` (empty strings for what you don't know, `discogsId` as a number). Fill in what you found: a short name, the pressing (word for word the `<pressing>` part you used, or will use, in the research entry's `pressings`, so the wall shows it as added; put extra detail in the name, label or catalog number instead), label, catalog number, the Discogs release, and a `budget` (a number as text) from the price you discussed. When you found the copy on a shop's product page, put that page in the copy's `buyLinks`. `update` with `if_version` and `needsSync: true`.

To save, `get` the record and `update` it (pass its `version` as `if_version`; on a conflict, `get` it again and redo) with:

- `researchLog`: the new entry first, then the record's existing entries (an older record may have a single `research` object instead; treat it as one entry). Keep at most 10: drop the oldest entries that aren't `pinned`, and never drop a pinned one.
- `research: null`.

The new entry: `id` (a fresh random id of 10 letters and digits), `at` (today, `YYYY-MM-DD`), `question` (their question, as they asked it), `headline` (the single most useful takeaway, one sentence of at most 14 words), `summary` (two to four sentences) and `sources` (up to 4 `{"title": …, "url": …}`, `https://` links only). Only when the conversation covered them: `pressings` (up to 4, each `"<pressing>: <why>"`, with no colon inside the pressing part, so the wall's + Want can add it as a copy), `check` (up to 3 things to verify in a listing), `where` (up to 3 places to look), `price` (one sentence of rough US prices) and `shops`.
  - `shops` is one line per shop you checked, in the order you checked them: `"<shop>: <result>"`, with the shop's name exactly as it is in the list. For example:
    - `"Revolver: in stock, $34.99, red vinyl"`
    - `"eBay: 12 listings, $28–60"`
    - `"Reckless Records: stock isn't online, call or email to ask"`
    - `"Amazon: nothing for this album"` (a shop that had nothing) Plain text, no markdown. Saving research needs no `needsSync`.

Then tell them in one line that it's saved; it shows up in the record's Research section.

## When you're done

Tell the person in a line or two what you added, including anything you looked up (like the shop's website) or couldn't find. The wall looks up the cover and album info itself, starting the next time it's opened, so say they'll fill in after they open the wall.
