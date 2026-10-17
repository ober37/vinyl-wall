# Roadmap

## Guiding principle

Vinyl Wall runs inside Claude, so a one-off question or fix ("point this record at the anniversary pressing", "is this 180g worth it?") is something to ask Claude in chat, not a feature to build. Build into the page only what you'd do again and again, or what should happen without being asked. Each feature should serve the three core actions: add a record, open it, play it.

## Next

1. **Release v0.2.0** so new installs (and friends testing) get the current version.
2. **First real Discogs import** on a tester's wall; it has only run against simulated data.
3. **Feedback channel** for testers (GitHub Issues).

## Ideas, roughly in order of fit

### Local record shops: "it's in stock near you"
Many independent shops publish their inventory online, and several run the same storefront software, with product pages addressed by barcode (for example `…/UPC/093624843276`). That makes one integration cover many shops.

- **Your shops:** a short list in Settings (name and website), e.g. Siren Records in McHenry.
- **Matching:** each hunt record gets its target pressing's barcode from its Discogs release (Discogs lists barcodes), so the check looks for the exact pressing, not just the album.
- **Checking:** the background task looks up each wanted barcode at each shop, either when you ask or on a gentle weekly schedule, and records price and availability.
- **On the wall:** a tag on the sleeve ("In stock at Siren · $39.98") and a line in the record's Find it section with a link to the shop's page.
- **Care points:** respect each site's terms and keep requests light; treat listings as "call to confirm"; fall back to a title search for shops without barcode pages.

### Price watch for the hunt
Alert when a wanted pressing is listed on Discogs under your budget. Same background-task pattern as shop checks.

### Sharing
A share image of the wall, and a view-only link for friends.

### Wishlist as a gift list
A shareable page of the hunt (priorities, target pressings, where to buy) for birthdays and holidays.

### Listening insights
Most played, last spun, and stylus hours by record, from the existing play log.

### Research notes
Pin a research entry or save it as a note on the record. Research history is already stored as dated entries, so this builds on what's there.

### Smaller polish
- Simpler "add equipment" flow (pick the type after tapping Add).
- Rail style picker in Settings (walnut, twine, barnwood, pipe, peg are already in the code).
