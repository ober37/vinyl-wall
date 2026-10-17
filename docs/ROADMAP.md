# Roadmap

## Guiding principle

Vinyl Wall runs inside Claude, so a one-off question or fix ("point this record at the anniversary pressing", "is this 180g worth it?") is something to ask Claude in chat, not a feature to build. Build into the page only what you'd do again and again, or what should happen without being asked. Each feature should serve the three core actions: add a record, open it, play it.

## Next

1. **First in-app update on a real wall** (v0.2.0 → latest), then confirm the page, data and background task all moved.
2. **First outside install** by a tester, from the setup link alone.

Done in v0.3: in-app updates (Settings says an update is available; one tap installs the latest tagged release), feedback through GitHub Issues, a contributor guide and a browser preview harness.
Done in v0.2: Discogs import, tested on a real collection and wantlist.

## Ideas, roughly in order of fit

Each one is a [GitHub issue labeled enhancement](https://github.com/ober37/vinyl-wall/issues?q=is%3Aissue+label%3Aenhancement) with the details needed to build it.

### Local record shops: "it's in stock near you" (#1)
Many independent shops publish their inventory online, and several run the same storefront software, with product pages addressed by barcode (for example `…/UPC/093624843276`). That makes one integration cover many shops.

- **Your shops:** a short list in Settings (name and website), e.g. Siren Records in McHenry.
- **Matching:** each hunt record gets its target pressing's barcode from its Discogs release (Discogs lists barcodes), so the check looks for the exact pressing, not just the album.
- **Checking:** the background task looks up each wanted barcode at each shop, either when you ask or on a gentle weekly schedule, and records price and availability.
- **On the wall:** a tag on the sleeve ("In stock at Siren · $39.98") and a line in the record's Find it section with a link to the shop's page.
- **Care points:** respect each site's terms and keep requests light; treat listings as "call to confirm"; fall back to a title search for shops without barcode pages.

### Price watch for the hunt (#2)
Alert when a wanted pressing is listed on Discogs under your budget. Same background-task pattern as shop checks.

### Sharing (#4)
A share image of the wall, and a view-only link for friends.

### Wishlist as a gift list (#5)
A shareable page of the hunt (priorities, target pressings, where to buy) for birthdays and holidays.

### Listening insights (#6)
Most played, last spun, and stylus hours by record, from the existing play log.

### Research notes (#7)
Pin a research entry or save it as a note on the record. Research history is already stored as dated entries, so this builds on what's there.

### Export and import from a file (#10)
Back up the library as JSON or a spreadsheet CSV, and bring records in from a backup, a CSV or a Discogs export file.

### Show when background work hit a usage limit (#3)
Say so plainly instead of waiting out the 15-minute timeout.

### Smaller polish
- Simpler "add equipment" flow (pick the type after tapping Add) (#8).
- Rail style picker in Settings (walnut, twine, barnwood, pipe, peg are already in the code) (#9).
