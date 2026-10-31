---
name: vinyl-wall
description: Add, update or research records on the person's Vinyl Wall (a published artifact) from a chat, often from photos of the record. Use whenever they ask to add, hang, log or change a record, an order or a wanted album on their wall, or to research one of its records and save what you found. Also use it to add, find or change the record shops the wall checks first ("find record shops near me").
---

# Adding records to a Vinyl Wall

Skill version 22.

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
- Wish: `copyName`, `budget`, `buyLinks` (see Where to buy a copy), `releaseDate` (see Release dates).

Write only what the person said or the photos show; leave the rest out. Before adding, `list` `records` and check it isn't already there (same artist and title); if it is, ask whether this is another copy or a change to the one there.

Ask either/or questions as a yes/no where you can ("Is it new or sealed?", not "New or used?"), so a "yes" is never ambiguous.

If a shop listing shows a release date still to come (a pre-order), ask whether they have it in hand before adding it as owned rather than ordered.

To change a record, `update` only the fields that change, plus `needsSync: true` so the change reaches Discogs (an order that arrives moves from the wantlist to the collection).

A record with `coverBlocked: true` had its cover removed on purpose: don't give it a cover (`coverAsset`, or `needsEnrich` for one) unless they ask. When they do, also set `coverBlocked: false`. Likewise `aboutBlocked: true` means they turned off its album and artist info (Not this artist): leave it off unless they ask, then set `aboutBlocked: false`, `aboutAt: ""`, `aboutV: 0` and `needsEnrich: true`.

## Where to buy a copy

Each copy they want can keep the shop pages where that exact copy is sold: `buyLinks`, a list of `https://` addresses. The first copy's is the record's own `buyLinks`; each other copy's is on its entry in `moreCopies`. When they give you a shop page for a copy, `get` the record, add the link to that copy's `buyLinks` (skip it if it's already there), and `update` with `if_version`.

When they point at links in a note, move each link onto the copy it's for, asking which copy when it's unclear. A link for a variant that isn't one of their copies yet: ask whether to add it as a copy they want (append it to `moreCopies` with its `buyLinks`, and add `needsSync: true`). Leave the note as it is unless they ask you to change it.

## Release dates

A copy they want that's a pre-order can keep the day it comes out: `releaseDate` (`YYYY-MM-DD`), the first copy's on the record, each other copy's on its entry in `moreCopies`. When a shop page for the copy gives a release day still to come, set it with the link (`update` with `if_version`; it doesn't need `needsSync`). If the page gives only a month or a season, don't guess a day: add a note instead (`"Out March 2027 (per <shop>)"`). When a wanted copy moves to ordered, the wall turns an upcoming `releaseDate` into the order's `eta` and `orderStatus: "preorder"` itself; when you add an order directly, set those instead of `releaseDate`.

## An order that arrived

When they say an ordered record arrived, `update` it the way the wall's It arrived does:

- `status: "own"`, `orderStatus: "delivered"`, `needsSync: true`.
- `acquired`: the date, under the same rule as a new record (today when they say it came today).
- `notes`: the existing notes plus `{"d": "<today, YYYY-MM-DD>", "t": "Arrived from <shop>. Hung it on the wall."}` (just `"Arrived. Hung it on the wall."` when it has no `shop`).
- Grades, as below.

## The shop's website

When the person names the shop they bought or ordered a record from (`shop`) but gives no website, look the shop's website up and save it in `shopUrl` as a full `https://` link. Never save a link that isn't http(s).

- **One of their shops:** when the shop is on their list (see Their shops), even said differently ("Siren in McHenry" for Siren Records), save that shop's exact `name` as `shop` and its `url` as `shopUrl`, without looking anything up.

- **Several matches:** ask which shop they mean only when the matches have different websites (the same name in two towns). A chain with several stores and one website (Amoeba: amoeba.com) needs no question.
- **Not sure:** if you can't find the website with confidence, save `shop` only, leave `shopUrl` out, and say so; they can add it in Edit.
- **Not on their shops yet:** the wall links a record to the shop on their list (see Their shops) with the same website, or else the same name. When the shop isn't on the list, and isn't a marketplace like Discogs or eBay, ask once after saving the record whether to add it to their shops. If they say yes, add it as in Adding a shop. If they say no, don't ask again about that shop in this chat.
- **Bought at a show:** a record bought from an artist's merch booth or table, at a concert or a festival, isn't from a shop. Save `shop` as `"Merch booth at <artist>, <tour or show>, <venue>, <city>"`, leaving out what you don't know, and no `shopUrl`. Don't look up a website, and don't offer to add it to their shops: the wall knows a show from those words and keeps it off its shop list.

## Grades

When you add a record they own, or an order arrives, set `mediaGrade` (vinyl) and `sleeveGrade` (sleeve). Use one of `M`, `NM`, `VG+`, `VG`, `G+`, `G`, `F` or `P`.

- **Clearly new:** the photos show it sealed, they say it's new or sealed, or the shop listing is for a new copy. "Just bought" or "bought today" gives the date, not the condition. Set both to `"M"` without asking, and say so in your reply.
- **Used, or you can't tell:** ask for the vinyl and sleeve grades before writing them, or let them skip. Never assume Mint for a used record.

## Their shops

The wall keeps the person's preferred shops as `shops` on the `settings/site` document. The wall's Search elsewhere lists them, and research checks them first. When `shops` is missing, the wall uses these defaults; the first time you change the list, write the defaults with your change so none of them is lost:

```json
[{"id": "revolver", "name": "Revolver", "kind": "online", "url": "https://shop.revolvermag.com/", "search": "https://shop.revolvermag.com/search?q={q}", "shopify": true},
 {"id": "amazon", "name": "Amazon", "kind": "online", "url": "https://www.amazon.com/", "search": "https://www.amazon.com/s?k={q}%20vinyl&i=popular"},
 {"id": "discogs", "name": "Discogs Marketplace", "kind": "market", "url": "https://www.discogs.com/sell", "search": "https://www.discogs.com/sell/list?q={q}&format=Vinyl"},
 {"id": "ebay", "name": "eBay", "kind": "market", "url": "https://www.ebay.com/", "search": "https://www.ebay.com/sch/i.html?_nkw={q}%20vinyl%20LP&_sacat=176985"}]
```

Each shop has:

- `id`: a fresh random id of 10 letters and digits.
- `name`.
- `kind`: `"local"` for a shop they can walk into (even one with a web store; it stays one shop), `"online"` for an online shop with its own stock, or `"market"` for a marketplace of many sellers, like eBay.
- `url`: its website or web store, as an `https://` link.
- `search`: its search page with `{q}` where the artist and album go, `https://` only, like `https://shop.revolvermag.com/search?q={q}`.
- `upc`: its product page by barcode with `{upc}` where the barcode goes, `https://` only, like `https://sirenrecordsmchenry.com/UPC/{upc}`. Only for shops that have one.
- `shopify`: `true` when it's a Shopify store, so its product data can be read (see Research).
- For a local shop only, also:
  - `place`: the street address with the town, like "1532 N Milwaukee Ave, Chicago, IL 60622".
  - `phone`.
  - `email`: only an address the shop publishes.
  - `about`: one or two sentences on what makes it worth the trip, like what it's known for. Leave out opening hours, because they change.

Leave out anything you can't find. The wall doesn't show `search`, `upc` or `shopify`, so the person never types them; it keeps them when the person edits a shop there, and drops them when they change its website, so they're found again for the new one.

**What a shop supports:** whenever you add a shop, fill one in, or list shops near them, work out what its web store supports, and save what works:
- **Search:** search its site for an album and note the results page's address, with `{q}` in place of the words. The wall's background task already tries the usual store searches (Shopify, WooCommerce, BigCommerce, the site's OpenSearch description, a search box that submits as a link); a shop with `searchTried` is one it couldn't place, so the store's search is likely drawn by JavaScript. When you save a `search`, write the shop without `searchTried`.
- **Barcode pages:** many record-shop storefronts open a product by barcode at `<store>/UPC/<barcode>`. Try it with the barcode of a record they're likely to stock (a Discogs release's barcode, from `https://api.discogs.com/releases/<id>`, `identifiers` of type "Barcode"), and save `upc` if it opens a product page. Also save it without opening a page when:
  - the store's pages load files from `cdn.broadtime.com`, which means it's a Broadtime storefront, and those always open products at `/UPC/<barcode>`;
  - the person gives you one of the store's barcode links (like `https://sirenrecordsmchenry.com/UPC/8717931357418`): save it with `{upc}` in place of the digits.
- **Shopify:** `<store>/search/suggest.json?q=<words>&resources[type]=product` answers with JSON.

Check each link works before saving it. Some stores answer automated visits with a bot check instead of the page: a near-empty page titled "Loading" that refreshes itself, or a challenge page. That doesn't mean the store lacks the feature, so don't decide anything from it; fall back on what you can tell (like the Broadtime files above) and say what you couldn't check. When listing shops near them, say in a word what each one's store supports ("searchable", "by barcode").

To change the list, `get` `settings/site`, then `update` it with the whole `shops` list and `if_version`.

- **Adding a shop:** look it up: the website, the search link, and for a local shop the address, phone, email and about. If a shop with that name is already on the list, fill in that one instead (next point). Tell them in a line what you added and what you couldn't find.
- **Filling in a shop:** when they ask you to fill in or update a shop already on the list (often one they added on the wall with just a name or a website), look up what's missing and fill only the empty fields. Never change what they typed, and keep its `id`. Tell them in a line what you filled in and what you couldn't find.
- **Finding shops near them:** when they ask for record shops near a place (a ZIP code, town or neighborhood), search the web. List up to 8 shops, nearest first. For each, give its town, one line about it, and whether its stock can be searched online (a web store you can search for an album). Ask which ones to add, and add only the ones they pick, as local shops. That includes shops without online stock, which you save with no `url` or `search`; the wall shows those with call, email and map links.
- **Re-checking a shop's search:** when they say a shop's search on the wall doesn't work or finds the wrong thing, find it again as above and replace its `search` (keep `shopify` only if it's still a Shopify store).
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
  - **Matching:** look up the album at each shop that has a `search`, and match only this album by this artist on vinyl. Skip CDs, tapes, merch and other albums. A shop with a website but no `search`: find its search as in What a shop supports, use it, and save it to the shop (see Missing shop details).
  - **By barcode:** at a shop with a `upc`, also open the product page for each copy they want that has a Discogs release (`discogsId`). The copy keeps its release's barcodes beside it as `barcodes: {"rid": <release id>, "codes": [...]}` (the record's own fields for its first copy, its `moreCopies` entry for the others); use those when `rid` is the copy's `discogsId`, else read them from `https://api.discogs.com/releases/<id>` (`identifiers` of type "Barcode", digits only). Put each in `upc`, a 12- or 13-digit one first. Skip the record's own copy when its `discogsMatch` is `"master main release"` or starts with `"vinyl: "`: that's the sync's guess at the album (often the original pressing), not the pressing they want; offer to set the right release instead. A page found that way is that exact pressing. If a shop's bot check stops you opening its pages, don't report it as having nothing: its line reads `"<shop>: couldn't check from here"`, and the pressing's barcode page goes in `sources` so they can open it themselves.
  - **Shopify stores (`shopify: true`, like Revolver):** they have structured data. `<shop>/search/suggest.json?q=<artist title>&resources[type]=product` lists matching products with `available`, `price` and `url`. `<shop>/products/<handle>.json` gives each variant's `price` and `available`.
  - **What to report:**
    - A shop: what's in stock (format, colour variant, price, link), and anything sold out or on pre-order.
    - A marketplace: how many listings and the price range.
    - A local shop whose stock isn't online: say they can call or email to ask.
  - **Exclusive variants:** an exclusive variant ("Limited to 200", a colour) is a pressing in its own right. Name it that way so it can be added as a copy.
  - **Sources:** cite product pages.
  - **Missing shop details:** when a shop you check is missing its search link (or, for a local shop, its address, phone, email or about), and you find them along the way, fill in the empty ones as in Filling in a shop. Mention it in a line ("I also saved Siren Records' search and filled in its address").
  - **Writing it up:** lead with the shops that have it, and sum up the rest in one line ("Nothing at Amazon or eBay"). Then cover other places on the web as usual.
- **Nothing found:** say so in one line. Don't pad the answer with things they didn't ask about, like what their copy is worth, unless they ask.
- **Saving:** when they seem done, ask once whether to save it to the record, and save only if they say yes. A follow-up prompt (starting `Follow up on my research from <date>: "<headline>"`, ending `My follow-up: …`) names an earlier entry: read it from `researchLog` first, and save the follow-up as a new entry.

- **A pressing worth hunting** (wanted records, `status: "wish"`): when you recommend one, ask once whether to add it to the copies they want ("Add the 2019 half-speed to the copies you want?"), and add it if they say yes, as below.

To add a copy they want, `get` the record and skip it if one of its copies already has that pressing or Discogs release. The record's own fields are its first copy: if `copyName`, `pressing`, `catalog`, `budget` and `discogsId` are all empty, fill those (`copyName` for the name). Two things don't count as a copy they chose: a `label` listed in `autoFilled` (looked up for the album), and a `discogsId` the wall's sync matched by itself, which it marks with a `discogsMatch` of exactly `"master main release"`, `"vinyl: master main release"`, `"vinyl: earliest original pressing"`, `"vinyl: first matching release"`, `"catalog"` or `"catalog+pressing"`. Any other `discogsMatch` (an import, or a release someone confirmed) is a copy they chose. When you fill the first copy over a matched release, replace `discogsId` with the release you found (or `""`) and set `discogsMatch` to `""`. Otherwise append `{"name", "pressing", "label", "catalog", "budget", "discogsId"}` to `moreCopies` (empty strings for what you don't know, `discogsId` as a number). Fill in what you found: a short name, the pressing (word for word the `<pressing>` part you used, or will use, in the research entry's `pressings`, so the wall shows it as added; put extra detail in the name, label or catalog number instead), label, catalog number, the Discogs release, and a `budget` (a number as text) from the price you discussed. When you found the copy on a shop's product page, put that page in the copy's `buyLinks`, and its release day in `releaseDate` when it's a pre-order (see Release dates). `update` with `if_version` and `needsSync: true`.

To save, `get` the record and `update` it (pass its `version` as `if_version`; on a conflict, `get` it again and redo) with:

- `researchLog`: the new entry first, then the record's existing entries (an older record may have a single `research` object instead; treat it as one entry). Keep at most 10: drop the oldest entries that aren't `pinned`, and never drop a pinned one.
- `research: null`.

The new entry: `id` (a fresh random id of 10 letters and digits), `at` (today, `YYYY-MM-DD`), `question` (their question, as they asked it), `headline` (the single most useful takeaway, one sentence of at most 14 words), `summary` (two to four sentences) and `sources` (up to 4 `{"title": …, "url": …}`, `https://` links only). Only when the conversation covered them: `pressings` (up to 4, each `"<pressing>: <why>"`, with no colon inside the pressing part, so the wall's + Want can add it as a copy) with `pressingDetails` (one object per pressing you found details for: `{"pressing": <its pressing part, word for word>, "name": <a short name>, "label", "catalog", "budget": <a number as text, from the price you discussed>, "link": <the shop's product page, https://>, "releaseDate": <YYYY-MM-DD, a pre-order's day>}`, leaving out what you don't know; the wall's + Want fills the copy from it), `check` (up to 3 things to verify in a listing), `where` (up to 3 places to look), `price` (one sentence of rough US prices) and `shops`.
  - `shops` is one line per shop you checked, in the order you checked them: `"<shop>: <result>"`, with the shop's name exactly as it is in the list. For example:
    - `"Revolver: in stock, $34.99, red vinyl"`
    - `"eBay: 12 listings, $28–60"`
    - `"Reckless Records: stock isn't online, call or email to ask"`
    - `"Amazon: nothing for this album"` (a shop that had nothing) Plain text, no markdown. Saving research needs no `needsSync`.

Then tell them in one line that it's saved; it shows up in the record's Research section.

## When you're done

Tell the person in a line or two what you added, including anything you looked up (like the shop's website) or couldn't find. The wall looks up the cover and album info itself, starting the next time it's opened, so say they'll fill in after they open the wall.
