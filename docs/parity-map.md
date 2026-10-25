# Vinyl Wall: production (v0.9.4) feature map to the React page

Production: `git show main:app/vinyl-wall.html` (2,324 lines; line numbers below are that file's). React: `web/src/` on `prototype/appica-ui` at e860bed. Plan quotes are from `docs/parity-plan.md` (Phases table). Tests: `web/src/**/*.test.ts(x)` and `web/scripts/check-cdn.mjs`.

Status key: TESTED, BUILT-UNTESTED, MISSING, DEPARTURE (plan records it), DIFFERS-UNRECORDED.

## Wall, header, filter, search

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Wall | Page title from settings, default "My Vinyl Wall", also the browser tab title | 1816-1818 | model/site.ts:52, wall/Wall.tsx:160-162 | TESTED | wall/Wall.test.tsx "follows a settings change made elsewhere" |
| Wall | Tab title before the wall loads ("Vinyl Wall") | 1 | web/index.html:6 ("Vinyl Wall appica") | DIFFERS-UNRECORDED | React's tab reads "Vinyl Wall appica" until status is ready (and stays so on no-db / no-runtime, since Wall never mounts). Grep of index.html, vite config, scripts: no rewrite |
| Wall | claude.ai edge-to-edge meta `claude:viewport-fit-sides` | 2 | none | MISSING | grep `viewport-fit` in web/index.html, vite.config, scripts, src: no hits |
| Wall | A title too long for its line: one overlong word ellipsised with a title tooltip (fitTitle) | 115-117, 1812-1814 | wall/Wall.tsx:176 (break-words) | DEPARTURE | Plan phase 6: "a single overlong word breaks rather than overflowing" |
| Wall | Filter chips: one per badge with its count, hidden at 0, colour swatch, none pressed shows all | 550, 698-701, 710-711 | wall/Wall.tsx:219-244, model/filter.ts:35-41 | TESTED | Wall.test "filters by the counts…", model/wall.test.ts "counts, filters, and ignores a filter on a badge no record has", check-cdn "filter chip" |
| Wall | Filter remembered per viewer (`rw.filter`), tolerant of blocked storage | 681, 700 | wall/Wall.tsx:24-43 | TESTED | Wall.test "filters by the counts and remembers…", "still works when this browser won't store anything" |
| Wall | Phones: chips show swatch + count only (owned keeps its word), words kept for screen readers | 130 | wall/Wall.tsx:240 | BUILT-UNTESTED | no test asserts the sr-only label |
| Wall | Counts row hidden on an empty wall | 663 | wall/Wall.tsx:219 | BUILT-UNTESTED | |
| Wall | Wall order: owned by added, ordered by ETA, hunt by priority then added | 672-677 | model/record.ts:52-59 | TESTED | Wall.test "hangs records in wall order…" |
| Wall | Sleeve: cover image or generated gradient face with title/artist, disc label colour from hash | 619-625, 644 | wall/Wall.tsx:101-103, wall/Face.tsx:6-27, model/record.ts:226-233 | TESTED | Wall.test "keeps a sleeve's cover in place…" (img present); generated face itself not asserted |
| Wall | Caption: title, artist, "year · label" | 640, 645 | wall/Wall.tsx:120-124, 297 | BUILT-UNTESTED | no test reads the meta line |
| Wall | Hang tag: order state · ETA; hunt priority | 641 | model/record.ts:241-247, wall/Wall.tsx:111-118 | TESTED | Wall.test "…tags in their names"; model/wall.test.ts "shows an order and a hunt, not an owned record" |
| Wall | Hang tag budget "≤$N" on a hunt | 641, 939 | model/record.ts:239 (comment: no budget) | DEPARTURE | Plan phase 2: "hang tags show priority without the budget" |
| Wall | "Example" label on example records' sleeves | 267, 644 | none | MISSING | grep `Example`/`example` in web/src: only gear `example` and task filters; no sleeve label |
| Wall | Busy dot on a sleeve (cover/details/album lookup), with aria/title | 258-263, 638, 643-644 | wall/Wall.tsx:97-110, model/task.ts:51 | TESTED | Wall.test "…Top want, syncing"; phase1 "hangs it…" (", syncing$"); wording "looking up details" became "syncing" (plan phase 6: "the wall's busy count reads '1 syncing' for lookups and syncs alike") |
| Wall | Sway on the rail, settle on hover, disc peeks out on hover, sliver + press on touch, reduced motion | 154-157, 239, 292, 543 | wall/wall.css:54-70, 263-282, 329-336; wall/Wall.tsx:101 | BUILT-UNTESTED | CSS only |
| Wall | Hanging styles (barnwood, pegs, cork, floating) on the rack | 162-231, 1809-1811, 1824-1825 | wall/wall.css:19-260, wall/Wall.tsx:290 | TESTED | Wall.test (data-hang barn); phase5 "hangs the records in the style picked" |
| Wall | Backgrounds: 5 photos and 8 patterns behind the wall, photo layer fixed (iOS) | 32-60, 1816-1823 | wall/Wall.tsx:65-71, model/site.ts:50-65, wall/wall.css | TESTED | phase5 "draws every pattern, and a picked one hangs behind the wall"; Wall.test (coffee-shop.jpg) |
| Wall | Small text readable over photo backgrounds (glow) | 288-290 | wall/wall.css:321, App.tsx:62 | BUILT-UNTESTED | |
| Wall | Dark mode follows the system | 18-27 | theme.css:66, main.tsx:38 | DEPARTURE | Plan phase 1: "theme follows the system" (same behaviour, recorded) |
| Wall | Touch screens hide scroll bars on page and sheet (stuck iOS bar) | 304-306 | none | MISSING | grep `scrollbar` in web/src/*.css, wall/wall.css, theme.css: no hits |
| Wall | Lookup line "Looking up N records…" under the counts | 551, 712 | App.tsx:88-100 | DEPARTURE | Plan phase 4: "a quiet 'Looking up N' at the end of the filter row (owners only)", phase 6: "reads '1 syncing'"; tested settings/phase0 / phase6 "shows as busy like a lookup…" |
| Wall | Screen-reader news when lookups start/finish | n/a (prod: visible line only) | App.tsx:34-44, 64-66 | BUILT-UNTESTED | React addition; "Sync finished" not in any test |
| Search | Search button opens a search box (aria-expanded), typing filters live | 552, 555, 692-694 | wall/Wall.tsx:182-195, 247-265 | TESTED | Wall.test "searches, says when nothing matches, and clears" |
| Search | Every word must match title, artist, label or year; accents and case ignored | 682-685 | model/filter.ts:14-24 | TESTED | model/wall.test.ts "folds accents and case", "needs every word…" |
| Search | Search button hidden while the wall has no records | 709 | wall/Wall.tsx:182 (always rendered) | DIFFERS-UNRECORDED | React renders Search on an empty wall; no plan line |
| Search | Escape in the box closes search and returns focus to the Search button | 695 | wall/Wall.tsx:258, 163-167 | BUILT-UNTESTED | no test presses Escape in the search box |
| Search | Clear button (X icon, "Clear search") closes search | 552, 696 | wall/Wall.tsx:261-263 ("Clear" text button) | BUILT-UNTESTED | label differs ("Clear"); not asserted |
| Search | No match: "Nothing on the wall matches "q" with this filter." + Clear the search | 578, 707-708 | wall/Wall.tsx:282-288 | DIFFERS-UNRECORDED | React drops " with this filter" (Wall.tsx:284); Clear the search is TESTED in Wall.test |
| Wall | Empty wall line for an owner | 577 | wall/Wall.tsx:276-281 | TESTED | phase5 "greets an owner's empty wall, and Start blank leaves the plain empty wall" |
| Wall | Empty wall for a viewer | 577, 663 | wall/Wall.tsx:279 ("Nothing hanging yet.") | DEPARTURE | Plan phase 5: "viewers of an empty wall see the plain line, not the card"; tested phase1 "is only for editors, and an empty wall says how to start" |
| Header | Add a record button, editors only | 559, 722 | wall/Wall.tsx:267-272, App.tsx:85 | TESTED | phase1 "is only for editors…" |
| Header | Add a record placement (+ beside the filters) | 558-560 | wall/Wall.tsx:267-272 | DEPARTURE | Plan phase 4: "Add a record is a + held to the right of the filter row" |
| Header | Settings button, editors only, brass dot and label when an update is out | 557, 1836-1837 | App.tsx:119-136 | TESTED | settings/phase0 "shows the update dot and the sentence to send…" |
| Header | Share button: editors only, hidden without downloads | 556, 2295 | wall/Wall.tsx:196-208, App.tsx:87 | DEPARTURE | Plan phase 6: "viewers get Share too; no Share on an empty wall or when nothing matches"; share.test "is there for viewers, but not on an empty wall…" |
| Header | Gear pill (label, meter, "N h left"/"Replace"/"Add your setup") | 554, 1551-1559 | gear/GearPill.tsx:12-60, model/gear.ts:108-121 | DEPARTURE | Plan phase 4: "Equipment is a round wear ring first beside Search and Settings…"; "hidden from viewers until there's gear"; tested gear/phase4 "the header pill" |
| Header | Phone layout (buttons on their own row above the title) | 99-113 | wall/Wall.tsx:173-180 | DEPARTURE | Plan phase 6: "on phones the round buttons sit on their own row above the title" |
| Welcome | Welcome card on an owner's empty wall until dismissed: intro, steps 1-3 | 563-573, 661-667 | wall/Welcome.tsx:5-85, App.tsx:101-115 | TESTED | phase5 "the welcome card" (3 tests) |
| Welcome | Step done marks (Discogs connected, gear added) | 665-666 | wall/Welcome.tsx:21, 28, 44-53 | TESTED | phase5 "opens Settings on Discogs with the username ready, and marks the steps done" |
| Welcome | Add a record step opens the new-record sheet | 669 | App.tsx:108 | BUILT-UNTESTED | |
| Welcome | Open Settings step lands on Discogs | 568, 669 | App.tsx:109, settings/SettingsSheet.tsx:273-277 | TESTED | phase5 (same test); plan phase 5 "Open Settings lands on Discogs" |
| Welcome | Set up equipment opens Equipment | 569, 670 | App.tsx:110 | BUILT-UNTESTED | |
| Welcome | Start blank (a 4th numbered step) | 570, 670 | wall/Welcome.tsx:71-76 | DEPARTURE | Plan phase 5: "Start blank under the steps"; tested phase5 |
| Welcome | "Import your library" link opens the Import sheet | 572, 670 | wall/Welcome.tsx:77-82 ("Import from a file"), App.tsx:112 | DEPARTURE | Plan phase 6: "the welcome card offers Import from a file"; tested phase6 "is offered from the welcome card of an empty wall" |
| Welcome | Shown to viewers too (buttons hidden) | 662 (no canEdit gate) | App.tsx:102 (canEdit gate) | DEPARTURE | Plan phase 5: "viewers of an empty wall see the plain line, not the card"; tested phase5 "isn't shown to viewers, or once dismissed" |

## Record sheet: view

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Sheet | Tapping a sleeve opens the record's sheet from the right | 717-719, 1086 | App.tsx:79-84, sheet/RecordSheet.tsx:158 | TESTED | RecordSheet.test "opens a record from the wall" |
| Sheet | Closes on Escape | 721 | appica Drawer (sheet/RecordSheet.tsx:158) | TESTED | gear/phase4 "a play just logged still offers Undo…" and phase1 "the lookup line" press Escape |
| Sheet | Closes on the Close button (focused on open) and on the scrim | 720, 1101, 1178-1179 | appica Drawer close button (node_modules/@appica/ui-react/dist/components/drawer/drawer.js:129-221) | BUILT-UNTESTED | no test clicks Close or the backdrop |
| Sheet | A record deleted elsewhere closes its open sheet | 713 | sheet/RecordSheet.tsx:104, 158 (open={!!r}) | BUILT-UNTESTED | |
| Sheet | A snapshot redraws the open sheet unless the person is typing | 2312-2319 | sheet/RecordSheet.tsx:56-64 | TESTED | RecordSheet.test "doesn't overwrite typing with a change made elsewhere" |
| Sheet | Phone width: full-width sheet | 299 | sheet/RecordSheet.tsx:159 | DEPARTURE | Plan decisions: "Record sheet is appica's Drawer from the right, full width on phones" |
| Header | Cover (larger in view), title, "artist · year · N min" | 1094-1099, 308-309 | sheet/RecordSheet.tsx:178-190 | BUILT-UNTESTED | heading is asserted everywhere; the by-line is not |
| Header | Status pill Owned / Ordered / Wanted | 1099 | sheet/RecordSheet.tsx:191-194 | DEPARTURE | Plan phase 2: "priority in edit and on the badge" (a hunt shows Top want/Want/Someday); tested phase1 "hangs it…" (badge "Want"), phase2 "shows the copies under the why, and the priority on the badge" |
| Header | Badges on owned records: Most played ever, Top this month, 10/50/100 hours | 1587-1599, 1099 | sheet/Badges.tsx:24-53, model/stats.ts:44-63 | TESTED | sheet/phase3 "shows a record's plays at a glance, and the badges…"; model/phase3 "the leader…", "marks 10, 50 and 100 hours…" (plan phase 3: "on their own row") |
| Header | Edit / Done button, editors only | 1101, 1198 | sheet/RecordSheet.tsx:195-207 | TESTED | RecordSheet.test "shows no edit controls to a read-only viewer", "writes pending edits at once on Done" |
| Summary | Album summary: lede + More/Less, older one-block clamped to 3 lines, "Summary by Claude · Wikipedia ↗" (or "from <artist> on Wikipedia") | 886-901, 1284 | sheet/ViewBody.tsx:84-130 | TESTED | sheet/summary.test.tsx (5 tests) |
| Summary | "Wikipedia has nothing on this album." when looked up with nothing | 895 | sheet/ViewBody.tsx:88-91 | TESTED | summary.test "says when Wikipedia had nothing" |
| Summary | While pending: pulsing "Looking up the album. This can take a minute or two." in the summary's place | 894, 409-410 | sheet/RecordSheet.tsx:155, 217-222; model/task.ts:54-57 ("Looking up the album…" in the header) | DIFFERS-UNRECORDED | Moved to a header lookup line with different wording; summary.test "says when the album is being looked up…" asserts the new line; the plan never says the summary's pending line moved |
| Why | "Why" blockquote; empty: dashed "Why is this one on the wall? / Why do you want this one? Add a few words…" opening edit on Why | 1105, 1199 | sheet/ViewBody.tsx:166-174, sheet/RecordSheet.tsx:283-286 | TESTED | slice2 "the empty-Why prompt opens edit mode with Why focused" |
| Status | Hunt: Ordered it / Got it; order: It arrived (editors) | 1106-1107, 1279-1281 | sheet/StatusActions.tsx:94-111 | TESTED | slice2 "status" tests; "shows a reader no controls" |
| Status | Several copies: "Which copy did you get/order?…" one tap per copy, Cancel | 1109-1110, 1272-1273, 1334 | sheet/Copies.tsx:75-97, sheet/StatusActions.tsx:49-60 | TESTED | phase2 "Got it on a hunt with two copies asks which, then what was paid", "Cancel on the picker moves nothing" |
| Status | "What did you pay?" Paid + Bought from/From, Save / Cancel, focus on Paid | 1111-1113, 1274-1278, 1336 | sheet/StatusActions.tsx:62-92 | TESTED | slice2 "Got it asks what was paid…", "Cancel leaves the record as it was" |
| Status | Move writes: acquired today / order delivered + "Arrived from X. Hung it on the wall." / "Found it · $N from X" / "Ordered · …" note; another shop drops the shop URL | 1332-1348 | model/status.ts:11-42 | TESTED | slice2 "Got it asks…", "It arrived hangs an order on the wall" |
| Status | After a move in view: message shown | 1348 (shown only in edit's #saved) | sheet/ViewBody.tsx:177-181 | DIFFERS-UNRECORDED | React shows "Moved to the wall. Acquired today." in view mode (slice2 asserts it); production showed it only in edit mode |
| Copies | Hunt copies in view: one copy an open card (name, pressing, label rule, budget "Up to $N"); several folded rows; looked-up label alone is no copy | 951-966 | sheet/Copies.tsx:19-71, model/copies.ts:38-61 | DEPARTURE | Plan phase 2: "copies under the why (folded rows with their budgets)"; tested phase2 "shows the copies under the why…", "shows a lone copy as a card…" |
| Copies | Empty folded copy row with no details | 965-966 | sheet/Copies.tsx:47-57 ("No pressing or budget yet" + Edit) | BUILT-UNTESTED | React adds an Edit shortcut; no test |
| Tabs | Tab bar: Listening / Research / Order first, then Research (owned), Notes (count, only when notes exist), About; no bar with one tab; arrow keys move | 1130-1141, 1251-1254 | sheet/ViewBody.tsx:149-196 | TESTED | slice2 "renders every tab and edit mode"; phase2 tabs ['Research','Notes']; arrow keys BUILT-UNTESTED (Base UI Tabs) |
| Tabs | The note box: on a hunt's Research tab, an owned record's Research tab, an order's Order tab; Notes tab only when notes exist | 1137-1144, 1156 | sheet/ViewBody.tsx:150, 212-216; sheet/NotesTab.tsx:41-67 | DIFFERS-UNRECORDED | React gives editors a Notes tab always, with the box there, on every kind. Plan records it only for orders (phase 3: "the order's note box stays on the Notes tab"); phase2 test expects tabs ['Research','Notes'] on a hunt |
| Tabs | Notes tab label shows the written-note count | 1141 | sheet/ViewBody.tsx:189-193 | BUILT-UNTESTED | |
| About | About the album: Released, Label (· catalog), Producer, Recorded, Genre | 903-913 | model/record.ts:209-222, sheet/ViewBody.tsx:219-224 | BUILT-UNTESTED | no test reads these rows |
| About | Recorded: place, then dates on their own line | 909-910 | model/record.ts:219 | DIFFERS-UNRECORDED | React shows the string on one line |
| About | Your copy (owned): Pressing, Bought (date · shop linked to its site · $paid), Grade | 863-870, 878-881 | sheet/ViewBody.tsx:17-54, 225-230 | BUILT-UNTESTED | |
| About | Your copy runout: folded behind "Show"/"N sides" with "· Cat. X", one line per side | 860-862, 868 | sheet/ViewBody.tsx:43-52 | DIFFERS-UNRECORDED | React lists the sides open with no fold and no "Cat." (and model/record.ts:216 then drops the catalog for an owned record with a runout, so it shows nowhere) |
| About | Your copy Discogs links: Your pressing / Find your pressing, What it sells for / Past sales (Popsike), Other pressings | 724-731, 928 | model/orders.ts:26-37 used only by sheet/OrderCard.tsx:57 | MISSING | grep `discogsLinks` in web/src: only OrderCard; ViewBody's copy section has no links |
| About | Tracklist with "Show all N tracks" past 12 | 915-926, 1285 | sheet/ViewBody.tsx:56-79 | BUILT-UNTESTED | no test asserts "Show all" or "Tracklist" |
| About | Tracklist side headings "Side A · mm:ss" when positions read A1, B2 | 918-922, 414-419 | none | MISSING | ViewBody.tsx:63-70 renders a flat list; grep `tside`/`Side ${` in sheet/: only the Log play picker (Listening.tsx:82) |
| About | Tracklist source: "From your Discogs pressing ↗ / MusicBrainz ↗" | 924-926 | none | MISSING | grep `MusicBrainz`, `tracksSource`, `tracksUrl` in web/src: no hits |
| About | About the artist: name, summary (lede + More/Less), credit (Summary by Claude · Wikipedia / From Discogs/Wikipedia), official links (Website, Instagram, YouTube, Spotify, Bandcamp, Apple Music…; first 5 + "+N") | 871-882, 983-995, 1286-1287 | none (runtime.tsx:26 "read-only here until its slice: About the artist") | MISSING | grep `About the artist`, `LINK_KINDS`, `Instagram`, `artistOf` in web/src: only that comment; artists are loaded (runtime.tsx:178) but never shown |
| About | About tab appears when it has album info, your copy, tracks or artist | 1132-1134 | sheet/ViewBody.tsx:148 | BUILT-UNTESTED | artist no longer counts (see above) |

## Edit

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Edit | Autosave: a pause after typing writes only changed fields, "Editing…" then "Saved"; Done and closing write at once | 1193, 1375-1401 | sheet/RecordSheet.tsx:34-98 | TESTED | RecordSheet.test "autosaves only the changed field", "writes pending edits at once on Done" |
| Edit | Album and artist editable (in the header in prod) | 1097-1098 | sheet/EditForm.tsx:220-228 | TESTED | model/edit.test "a new title or artist looks the album info up again" (plan phase 1: "the album-info re-lookup fix") |
| Edit | Status switch in edit moves like the buttons, without asking what was paid | 1125, 1195, 1336 | sheet/EditForm.tsx:205-219, sheet/RecordSheet.tsx:124-135 | TESTED | slice2 "edit mode moves without asking what was paid"; phase2 "edit mode's status asks which copy…" |
| Edit | "Moved back to the hunt." / "Marked as ordered today." status line | 1344-1345 | model/status.ts:18, 30 | BUILT-UNTESTED | |
| Edit | Why textarea with kind-specific legend and placeholder | 812 | sheet/EditForm.tsx:230-244 | TESTED | slice2 "renders every tab and edit mode" (Why textbox) |
| Edit | Priority Top / Want / Someday (saved as a number) | 825 | sheet/EditForm.tsx:246-260 | TESTED | phase2 "saves a priority as a number, and Discogs sync hears of it" |
| Edit | Copies: first in the record's fields, others in moreCopies, + Add another copy (focus its Name), Remove this copy | 826-838, 1266-1270 | sheet/CopiesEdit.tsx:72-176 | TESTED | phase2 "edits a hunt's copies…", "adds a copy at once and puts the cursor in its name" |
| Edit | Removing a copy with details asks first; a hunt's only copy can be removed (cleared) | 828 (no confirm; hunt keeps one) | sheet/CopiesEdit.tsx:102-109, 167-173 | DEPARTURE | Plan phase 2: "removing a copy with details asks first, and a hunt's only copy can be removed (cleared back to blank)"; tested phase2 |
| Edit | Owned/ordered: "The copy/copies you still want" group | 838 | sheet/CopiesEdit.tsx:160-166 | TESTED | phase2 "shows an owned record the copies it still wants, and lets them all go" |
| Edit | Ordered: the copy ordered + the order (status, expected, from, shop website, paid, ordered on, order #, carrier, tracking #, older order notes) | 840-847 | sheet/CopiesEdit.tsx:153-158, sheet/EditForm.tsx:143-194 | DEPARTURE | Plan phase 3: "the order in edit ('The order' under the copy ordered, status as a Select)"; tested sheet/phase3 "edits the order in its own group…", "has no Order notes box…" |
| Edit | Your copy (owned): pressing, bought on, paid ($ stripped), bought from, shop website, vinyl/sleeve grades | 816-819 | sheet/EditForm.tsx:264-287 | TESTED | model/edit.test "stores production shapes"; RecordSheet.test "autosaves…" |
| Edit | Shop website: "https://" added to a bare domain; "Not a web address, so it won't link" hint | 807-809, 878, 1182-1184, 1369 | sheet/EditForm.tsx:114-130, model/edit.ts:111 | BUILT-UNTESTED | hint shows while typing in React (prod waits for change); shop URL storing tested only via stored() shape |
| Edit | Runout by side, + Add side up to Z, saved "Side A: … · Side B: …" | 796-800, 820-821, 1324-1328 | sheet/DiscogsEdit.tsx:18-65, model/discogs.ts:57-73 | TESTED | sheet/phase6 "the runout in edit" (2 tests) |
| Edit | Discogs release number (number or pasted link), Open on Discogs ↗, sync line, general-release hint | 1366-1367, 1505-1513 | sheet/DiscogsEdit.tsx:76-134, model/discogs.ts | TESTED | sheet/phase6 "the Discogs release in edit" tests |
| Edit | Release line wording ("matched by X"); link kept as typed; empty field | 1507-1512 | model/discogs.ts:44-47, sheet/DiscogsEdit.tsx:83-103 | DEPARTURE | Plan phase 6: "a pasted link becomes its number as it's pasted… an automatic match reads 'Matched automatically (…)', an empty field shows only its hint" |
| Edit | Copy runout for a Discogs submission (owned with a runout), clipboard fallback selects the text | 1263-1265, 1502-1504, 1514-1515 | sheet/DiscogsEdit.tsx:135-152 | DIFFERS-UNRECORDED | React offers it only when a release number is set (`id !== ''`, DiscogsEdit.tsx:135); prod only needs status own + runout. On clipboard failure React says "Couldn't copy here. Select the runout above…" instead of showing the text selected. Copy itself tested (phase6 "copies the runout as typed…") |
| Edit | About the album: year, runtime (min), label + catalog on owned | 848-849 | sheet/EditForm.tsx:290-298 | TESTED | phase1 "marks what the lookup filled in" |
| Edit | Runtime placeholder "Looking it up…" while a lookup is pending | 849 | sheet/EditForm.tsx:294 ("e.g. 46" always) | MISSING | grep "Looking it up" in web/src: no hits |
| Edit | "auto-filled" mark on looked-up artist/year/label/runtime, dropped once typed over | 1172-1173, 1381 | sheet/EditForm.tsx:61, CopiesEdit.tsx:17, model/edit.ts:124-125 | TESTED | phase1 "marks what the lookup filled in"; model/edit.test "drops a typed field from autoFilled" |
| Edit | Upload / Replace cover (shrunk to 500px), stops the lookup waiting for one | 1122-1124, 1416-1436 | sheet/CoverButton.tsx:8-47, model/create.ts:27-31 | TESTED | phase1 "replaces the cover and stops waiting for one", "says why an upload failed"; model/create.test "shrinking an image" |
| Edit | Cover upload where the view can't store files: "Cover uploads aren't available in this view." | 1431 | sheet/CoverButton.tsx:17 (button hidden) | DIFFERS-UNRECORDED | React hides the button instead of explaining; tested phase1 "offers no upload where this view can't store files"; plan silent |
| Edit | Find cover & details (disabled "Looking it up…" while pending) starts the task | 1124, 1288, 1456 | sheet/RecordSheet.tsx:148-151, 241-243 | TESTED | settings/phase0 "Find cover & details marks the record and starts the task…"; phase1 "the lookup line" (disabled) |
| Edit | Find cover & details flash "Looking up X… the cover usually appears within a few minutes." | 1456 | sheet/RecordSheet.tsx:155, 217-222 (header line) | DIFFERS-UNRECORDED | Replaced by the header lookup line ("Looking up the cover and details…"); grep "within a few minutes" in web/src: none; plan silent |
| Edit | Not this artist (when an artist or summary was matched) | 1124, 1283 | sheet/RecordSheet.tsx:244-248, model/create.ts:34-38 | TESTED | phase1 "Not this artist drops the matched artist and album info" |
| Edit | Remove from the wall… with "Remove X and its notes for good?" Remove / Keep it | 1169-1170, 1257-1262 | sheet/EditForm.tsx:306-319 | TESTED | slice2 "remove" tests |
| Edit | Removing a Discogs-synced record marks it deleted + needsSync | 1260 | runtime/runtime.tsx:457-458, model/edit.ts:44-54 | TESTED | slice2 "marks a Discogs-synced record deleted…" |
| Edit | Notice "Removed. Taking it off Discogs too." | 1260 | none | MISSING | grep "Taking it off" in web/src: no hits; React closes silently |
| Edit | Remove failure "Couldn't remove it: …" | 1262 | runtime/runtime.tsx:347-349 ("Couldn't save: …") | BUILT-UNTESTED | wording differs (generic save error) |

## Add a record and lookup

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Add | New-record sheet: Album, Artist, "It's… I own it / On order / I want it", Hang it disabled until chosen | 1115-1118 | sheet/NewRecordSheet.tsx:84-145 | TESTED | phase1 "hangs it, starts the lookup and opens it" (x3) |
| Add | "Album and artist are needed." | 1403 | sheet/NewRecordSheet.tsx:67 | TESTED | phase1 "needs an album and an artist" |
| Add | Enter in a field hangs it | (form submit) | sheet/NewRecordSheet.tsx:103-111 | TESTED | phase1 "hangs it with Enter in the artist field" |
| Add | Hang it once ("Hanging…"), id kept for a retry, draft kept after a failure, "Couldn't add it: …" | 1408-1414 | sheet/NewRecordSheet.tsx:65-82, runtime/runtime.tsx:358-373 | TESTED | phase1 "hangs it once however fast you click", "keeps the draft after a failed write…" |
| Add | Same album in the last 2 minutes opens that one | 1409-1411 | model/create.ts:21-24 | TESTED | phase1 "opens the one just added…"; model/create.test |
| Add | Add details now: that kind's fields; "Choose what it is first."; kind change keeps what's typed | 1120-1121, 1189-1190 | sheet/NewRecordSheet.tsx:146-187, 60-63 | TESTED | phase1 "keeps what was typed when the kind changes"; "Choose what it is first." BUILT-UNTESTED |
| Add | Cover upload in Add details now, "Cover ready. It'll hang with the record."; dropped with the draft | 1122, 1434 | sheet/NewRecordSheet.tsx:166-180 | TESTED | phase1 "hangs an uploaded cover with the record…", "doesn't carry an abandoned cover…" |
| Add | needsEnrich unless cover, year and label; record opens in view; task starts | 1405-1407, 1413 | model/create.ts:9-18, sheet/NewRecordSheet.tsx:80-81, App.tsx:173-177 | TESTED | phase1 "hangs it…"; model/create.test "is looked up unless…" |
| Add | A new hunt keeps its first copy and priority | 1405 | model/create.ts:10 | TESTED | phase2 "hangs with its first copy and chosen priority" |
| Add | A new order keeps the state chosen | 843 | model/create.ts:14 | TESTED | model/phase3 "a new order keeps the state chosen in Add details now" |
| Lookup | Header lookup line in the sheet while the task works ("Looking up the cover and details…") | n/a (prod: flash + summary line) | sheet/RecordSheet.tsx:155, 217-222 | DEPARTURE | Plan phase 1: "lookup dots" (built and tested); tested phase1 "the lookup line" |
| Lookup | Album info re-looked-up when title/artist change | n/a | model/edit.ts:126-128 | DEPARTURE | Plan phase 1: "with the album-info re-lookup fix (5550d1e)"; tested model/edit.test |

## Hunt, copies, research

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Research | Research tab: hunt always; owned for editors or with entries; ordered while copies are still wanted | 1132 | sheet/ResearchTab.tsx:291-294 | TESTED | phase2 "opens first on a hunt…", "keeps shopping links off an owned record…" |
| Research | Copies still wanted at the top of an owned/ordered record's Research tab | 1156 | sheet/ResearchTab.tsx:232 | TESTED | phase2 "shows an owned record the copies it still wants…" |
| Research | "Research this record in your Claude chat…" + Copy for Claude (primary with no entries) | 1445-1448, 1302 | sheet/ResearchTab.tsx:237-253 | TESTED | phase2 "Copy for Claude hands over a prompt naming the record" |
| Research | The prompt: record, wall URL when https, "Use the vinyl-wall skill…", follow-up variant | 1441-1444 | model/research.ts:88-100 | TESTED | model/hunt.test "hands Claude a prompt naming the record, the wall…, and what is followed up" |
| Research | Clipboard blocked: prompt shown selected, "Selected: copy it with your device's copy command" | 1451-1454 | sheet/ResearchTab.tsx:20-54 | BUILT-UNTESTED | |
| Research | Log entries newest first, pinned first and open, date + headline/first sentence, folding | 745-788 | sheet/ResearchTab.tsx:88-92, 154-228 | TESTED | phase2 "opens first on a hunt, pinned entry first and open…" |
| Research | Entry body: You asked, summary, Pressings, Check in a listing, Where to look, Price, Sources (http only) | 776-782 | sheet/ResearchTab.tsx:173-207 | TESTED | phase2 (sources link, bad one dropped); "Which pressing?" asserted |
| Research | Pin / Unpin (one at a time; moves a legacy entry into researchLog) | 783, 1296-1298 | model/research.ts:42-48 | TESTED | phase2 "pins one entry at a time…"; model/hunt.test "pins one entry at a time…" |
| Research | Follow up in chat (not on orders) | 784, 1299-1301 | sheet/ResearchTab.tsx:213-217 | TESTED | model/hunt.test (prompt); button absence for readers in phase2 |
| Research | Remove this research (no confirm in prod) | 785, 1317-1319 | sheet/ResearchTab.tsx:218-220, 275-284 | DIFFERS-UNRECORDED | React asks "Remove this research for good?" first; phase2 "pins one entry at a time, and removes one after asking"; plan silent |
| Research | + Want on a researched pressing; ✓ Added when already wanted; "Added "p" · Edit · Undo" | 753-771, 1303-1316 | sheet/ResearchTab.tsx:101-152, model/research.ts:55-85 | TESTED | phase2 "+ Want adds a pressing…", "+ Want's Edit opens edit mode in that copy", "keeps + Want's Undo through Edit and back"; model/hunt.test |
| Research | Search elsewhere: Discogs releases, Discogs marketplace, eBay, MusicStack, Popsike, Record stores near me | 732-743, 1152-1153, 1161 | model/research.ts:103-114, sheet/ResearchTab.tsx:261-274 | TESTED | phase2 (eBay href, marketplace for readers) |
| Research | Search elsewhere on every owned record's Research tab | 1161 | sheet/ResearchTab.tsx:261 | DEPARTURE | Plan phase 2: "shopping links on an owned record only while it still wants a copy"; tested phase2 |
| Research | Readers see entries and links without buttons | 769, 783 (editonly) | sheet/ResearchTab.tsx:117, 208, 237 | TESTED | phase2 "shows a reader the research and links, without the buttons" |

## Orders

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Order | Order tab first on an ordered record | 1141 | sheet/ViewBody.tsx:152, 202-206 | TESTED | sheet/phase3 "opens first on an ordered record…" |
| Order | The order as a folding entry (open to start) with title and status summary | 979 | sheet/OrderCard.tsx:52-66 | DEPARTURE | Plan phase 3: "the order is an open card, not a folding row" |
| Order | Status with expected date and Track ↗ (carrier page, pasted link, else a search) | 974-975, 629-635 | sheet/OrderCard.tsx:27-43, model/orders.ts:5-23 | TESTED | sheet/phase3 tests; model/phase3 "links a tracking number to its carrier's page…" |
| Order | Pressing, Label · catalog, From (shop linked), Paid else Budget, Ordered | 972-978 | sheet/OrderCard.tsx:44-50 | TESTED | sheet/phase3 "shows what was paid instead of the budget…" |
| Order | Older order notes shown in view | 847 (edit only) | sheet/OrderCard.tsx:51 | DEPARTURE | Plan phase 3: "older order notes show in view" |
| Order | Discogs links: The edition you ordered / Find the edition, What it sells for / Popsike, Other pressings | 727-730, 980 | sheet/OrderCard.tsx:56-64, model/orders.ts:26-37 | TESTED | model/phase3 "links the edition ordered on Discogs…" |
| Order | Order note box on the Order tab, "Shipping update, a note from the seller…" | 1140, 1144 | sheet/NotesTab.tsx:10-14, 41-67 | DEPARTURE | Plan phase 3: "the order's note box stays on the Notes tab" |
| Order | A stored order state with no option reads as Ordered | 843 | model/record.ts:237 | TESTED | model/phase3 "reads an order state it has no option for as Ordered" |

## Plays, listening, badges

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Plays | Stats row: Plays, Hours, This month, Last | 1014-1016 | sheet/Listening.tsx:204-223, model/stats.ts:10-26 | TESTED | sheet/phase3 "shows a record's plays at a glance…"; model/phase3 "counts only play notes…" |
| Plays | Log a play: Whole album / Side (which side) / Tracks (by side, durations) | 1025-1032, 1205-1211 | sheet/Listening.tsx:29-117 | TESTED | slice2 "logs a whole album…", "logs a side…", "logs picked tracks…"; check-cdn "Log a play: choosing Side" |
| Plays | Track picks: "Pick tracks" disabled, "Log N tracks"; whole side → side, all → whole album | 1206-1207, 1213-1219 | sheet/Listening.tsx:112-114, model/plays.ts:30-38 | TESTED | slice2 "logs picked tracks, collapsing a whole side…" |
| Plays | Minutes: runtime (or 40), half for a side, track durations (average for unknown) | 1022-1023, 1608 | model/plays.ts:22-43 | TESTED | slice2 (~42, ~21, ~23 min) |
| Plays | "Played on" setup picker with two setups or more, remembered (`rw.lastSetup`) | 1029, 1212, 1544-1547 | sheet/Listening.tsx:95-111, model/gear.ts:124-141 | TESTED | gear/phase4 "Log play names the setup…", "a wall with one setup names it without asking"; remembering BUILT-UNTESTED |
| Plays | Play note text "Played … on Setup (~N min)" | 1612, 1616 | model/plays.ts:46-54 | TESTED | gear/phase4, slice2 |
| Plays | Logged line (minutes on N pieces, worst piece) / "Logged the listen. Add your gear to track wear." | 1617-1618 | model/gear.ts:183-189, sheet/Listening.tsx:62, 146-150 | DEPARTURE | Plan phase 4: "Log play's line names the piece that took the minutes (or the most worn among them…)"; tested phase4 |
| Plays | Journal opens on the play just logged: Save / Skip / Undo | 1065-1074, 1615 | sheet/Listening.tsx:119-201, 225-242 | TESTED | slice2 "logs a whole album, opens its journal, and Undo…", "a second play the same day opens only its own journal" |
| Plays | Journal kept across close/reopen (Undo survives) | 1349 (prod clears) | sheet/Listening.tsx:24-27 | DEPARTURE | Plan phase 4: "a play just logged keeps Undo when its sheet is closed and opened again (production clears it)"; tested phase4 |
| Plays | Vibe: five-stop slider, unset shows "Set the vibe" on a dimmed slider, Clear | 1018-1020, 1067-1068, 1230-1234 | sheet/Listening.tsx:151-173 | DIFFERS-UNRECORDED | React hides the slider behind a "Set the vibe" button that starts at "Locked in"; slice2 "logs a side and saves thoughts on it" asserts the new flow; plan silent |
| Plays | Thoughts textarea "What stood out tonight?"; thoughts linkified in history | 1069, 1076 | sheet/Listening.tsx:174, 273-277 | TESTED | slice2 (Your thoughts saved); linkify in history BUILT-UNTESTED |
| Plays | Older play: + Thoughts / Edit, change "Played on" date (moves the gear entry), Cancel | 1070, 1077, 1224, 1239 | sheet/Listening.tsx:175-180, 130-135, 279-283 | BUILT-UNTESTED | the journal's date change and its gear move are not asserted (gear/phase4 opens + Thoughts only to delete) |
| Plays | Delete this play with confirm naming what comes off the gear | 1071-1072, 1227-1229, 1042-1044 | sheet/Listening.tsx:193-198, model/gear.ts:176-180 | TESTED | gear/phase4 "deleting a play says what comes off the gear, and takes it off" |
| Plays | History by month, newest first, current month open, closed months show "N plays · H h" | 1046-1059, 1222-1223 | sheet/Listening.tsx:233-293, model/record.ts:155-199 | BUILT-UNTESTED | React shows the counts on open months too; no test folds a month |
| Plays | Play row icon ● whole / ◐ side / ◔ tracks | 1064 | none | MISSING | Listening.tsx:269-284 renders text only; grep "◐" in web/src: no hits |
| Plays | Play row meta "date · what · setup", vibe name under it | 1060-1063, 1076 | sheet/Listening.tsx:271-272 | TESTED | gear/phase4 ("Whole album · Living room") |
| Plays | "No plays logged yet." | 1151 | sheet/Listening.tsx:248-249 | TESTED | sheet/phase3 "a record with no plays has no stats or badges" |
| Plays | Older mood values read as a vibe | 1019 | model/record.ts:133-138 | BUILT-UNTESTED | |
| Plays | Readers: no Log a play, no Edit/+ Thoughts | 1027, 1077 | sheet/Listening.tsx:247, 279 | TESTED | slice2 "shows a reader no controls" |

## Notes

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Notes | Add a note (multi-line; Cmd/Ctrl+Enter adds), kind-specific placeholder | 1140, 1200-1203 | sheet/NotesTab.tsx:29-67 | TESTED | slice2 "adds a note on top of one written elsewhere…"; Cmd+Enter BUILT-UNTESTED |
| Notes | Written notes newest first with date, links clickable | 1079-1085, 591-599 | sheet/NotesTab.tsx:68-105, sheet/Linkify.tsx | TESTED | slice2 "edits and deletes a note, with links clickable" |
| Notes | Edit in place: Save / Cancel / Delete with "Delete this note?" Delete / Keep it | 1082-1084, 1243-1250 | sheet/NotesTab.tsx:75-90, 106 | TESTED | slice2 "edits and deletes a note…" |
| Notes | A note written elsewhere isn't lost by a write here | 1203 (prod writes from its copy) | runtime/runtime.tsx:326-354 (fresh read), model/notes.ts | TESTED | slice2 "adds a note on top of one written elsewhere that this view hasn't seen" |

## Equipment

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Equip | Equipment sheet: "Your setups, and how much play each piece has seen" | 1623-1630 | gear/EquipmentSheet.tsx:126-224 | TESTED | gear/phase4 "shows the stylus wear and opens Equipment" |
| Equip | Listening summary: this month · in all · last spun; top 5 records opening their sheet | 1601-1606, 1654 | gear/ListeningSummary.tsx:6-39 | TESTED | gear/phase4 "the Listening summary opens a record, which offers the way back" |
| Equip | Listening summary empty hint "Open a record and tap Played the whole album." | 1603 | gear/ListeningSummary.tsx:8 ("Open a record and log a play.") | DIFFERS-UNRECORDED | wording only |
| Equip | Record opened from the summary: back link to Equipment | n/a | App.tsx:148-157, sheet/RecordSheet.tsx:162-175 | DEPARTURE | Plan phase 4: "a record opened from the Listening summary has a ‹ Equipment link back"; tested |
| Equip | Setup groups with notes, gear cards, "No equipment in this setup yet.", Add equipment, Rename or edit setup | 1626, 1633-1637 | gear/EquipmentSheet.tsx:70-89 | TESTED | gear/phase4 (Den group, "By the window"); empty-setup line BUILT-UNTESTED |
| Equip | No setups: "Setups" hint + "Additional setups" fieldset with Add a setup | 1637-1641, 1657-1659 | gear/EquipmentSheet.tsx:61-69, 90-95 | DEPARTURE | Plan phase 4: "a first setup starts from Add your turntable, later ones from a dashed + Add another setup"; tested phase4 |
| Equip | Not in a setup group, "Open each piece and choose its setup." | 1627-1628 | gear/EquipmentSheet.tsx:96-102 | BUILT-UNTESTED | |
| Equip | Shared equipment with hint and Add shared equipment | 1642-1646 | gear/EquipmentSheet.tsx:103-114 | TESTED | gear/phase4 (Shared equipment group present); the add button BUILT-UNTESTED |
| Equip | Retired group | 1648 | gear/EquipmentSheet.tsx:115-120 | BUILT-UNTESTED | |
| Equip | Gear card: type, name, meter, "N h · N h to go / in window / N h over", state chip; untracked "Since date" / "Not hours-tracked" | 1530-1534, 1620-1622 | gear/EquipmentSheet.tsx:19-31, gear/Wear.tsx:28-43, model/gear.ts:76-80 | DIFFERS-UNRECORDED | React reads "N h left" (and "at rated life") for prod's "N h to go"; plan records the pill's "remaining" only. Card otherwise BUILT-UNTESTED |
| Equip | Retired card shows hours without a wear verdict | 1519 | gear/Wear.tsx:31-33 | DEPARTURE | Plan phase 4: "retired gear shows its hours without a wear verdict" |
| Equip | Setup sheet: Name, Notes (autosave, "Untitled setup"), All gear, Delete setup with confirm moving its gear out | 1694-1718 | gear/SetupView.tsx:12-74, gear/EquipmentSheet.tsx:200-216 | BUILT-UNTESTED | no test renames or deletes a setup |
| Equip | Add equipment: type chips, then Make & model (type's example), In use since, Hours played so far, rated life (stylus 300-500 default), hint; Add / Cancel | 1663-1693 | gear/AddGear.tsx:15-102, model/gear.ts:195-202 | TESTED | gear/phase4 "a first setup: Add your turntable…" |
| Equip | Add opens the new piece | 1690 (back to Equipment) | gear/AddGear.tsx:38, gear/EquipmentSheet.tsx:217 | DEPARTURE | Plan phase 4: "Add opens the new piece" |
| Equip | Gear item: Play time big number, state, gauge with 0 / low / high ticks, message | 1726-1730 | gear/GearItem.tsx:68-77, gear/Wear.tsx:46-67 | TESTED | gear/phase4 "a piece of gear: play time and details in view…" |
| Equip | Add time (minutes played off the wall) | 1731, 1772-1773 | gear/GearItem.tsx:35-42, 78-92 | TESTED | gear/phase4 (same test) |
| Equip | Add time on a retired tracked piece | 1731 (shown) | gear/GearItem.tsx:78 (`g.status !== 'retired'`) | DIFFERS-UNRECORDED | React hides it on retired gear; plan silent |
| Equip | Details: type, make & model, setup, in use since, bought from, paid, warranty, setup notes, Track play hours (fills the type's rating), rated life, hours before tracking; autosave | 1733-1750, 1764-1771 | gear/GearItem.tsx:55-64 (view), 197-328 (edit) | DEPARTURE | Plan phase 4: "gear details are view + Edit"; edit tested in phase4 (Make & model, Done) |
| Equip | Log: entries with ×, add "Log" with placeholder | 1751-1754, 1774-1775 | gear/GearItem.tsx:101-135 | TESTED | gear/phase4 shows an entry; adding an entry BUILT-UNTESTED |
| Equip | Deleting a log entry | 1775 (no confirm) | gear/GearItem.tsx:164-174 | DEPARTURE | Plan phase 4: "deleting a gear log entry asks first"; tested phase4 |
| Equip | Recent plays (last 12) | 1755 | gear/GearItem.tsx:136-149 | BUILT-UNTESTED | |
| Equip | Replace with a new one (retire + fresh piece at 0 h, notes) | 1779-1783 | gear/GearItem.tsx:48-53, 150-163; model/gear.ts:204-213 | DEPARTURE | Plan phase 4: "Replace and Retire ask with a calm confirm and Replace keeps the setup"; tested phase4, model/gear.test |
| Equip | Retire with confirm | 1784 | gear/GearItem.tsx:225-228, 335-351 | DEPARTURE | Plan phase 4 (same phrase); not asserted in a test |
| Equip | Put back in use | 1785 | gear/GearItem.tsx:330-333 | BUILT-UNTESTED | |
| Equip | Delete piece "Delete X and its log for good?" | 1786-1787 | gear/GearItem.tsx:229-232, 352 | BUILT-UNTESTED | |
| Equip | Readers see gear without controls | 1650, 1760-1761 | gear/EquipmentSheet.tsx:77, 188, 215-217 | TESTED | gear/phase4 "a viewer sees the gear without any way to change it" |
| Equip | Wear states: Healthy / Getting close (10 h) / Replace window / Replace now / Tracking / In use / Retired | 1518-1528 | model/gear.ts:63-73 | TESTED | model/gear.test "goes healthy, getting close, replace window, replace now" |
| Equip | Plays put minutes on tracked gear in the setup + shared + unassigned; all tracked gear with no setups | 1546, 1609-1614 | model/gear.ts:143-155 | TESTED | model/gear.test "plays on gear" |

## Settings

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Settings | Settings sheet "How your wall looks, your Discogs connection and your library" | 1862-1867 | settings/SettingsSheet.tsx:243-300 | TESTED | settings/phase5 tests open it |
| Settings | Update notice: sentence to send Claude, Copy (selects on failure), dot on the button | 1830-1845, 1969-1970 | settings/SettingsSheet.tsx:313-344, model/task.ts:65-76 | TESTED | settings/phase0 "shows the update dot and the sentence…", "offers no update for this or an older version"; copy fallback BUILT-UNTESTED |
| Settings | Opening Settings checks for a release once a day | 1977-1978 | settings/SettingsSheet.tsx:279-283 | BUILT-UNTESTED | |
| Settings | Page: Title (60 chars, autosave 500 ms, "Saved") | 1870-1873, 1931 | settings/LookSections.tsx:22-65 | TESTED | phase5 "saves the title as it is typed and the wall shows it" |
| Settings | Background: 13 tiles, keyboard selectable | 1874-1878, 1932-1938 | settings/LookSections.tsx:150-200 | TESTED | phase5 "draws every pattern…" |
| Settings | Upload your own background (15 MB limit, shrunk to 2000px), not available message | 1879, 1940-1944 | settings/LookSections.tsx:120-139, 191-215 | TESTED | phase5 "uploads a photo…", "says so when a photo is too big…", "hides the upload tile without file storage" (plan phase 5: "upload your own as the grid's last slot") |
| Settings | Remove an uploaded background with confirm (back to Listening room) | 1877, 1945-1950 | settings/LookSections.tsx:140-147, 233-239 | DEPARTURE | Plan phase 5: "removing the uploaded photo in use goes back to the background it replaced (bgBefore)"; tested phase5 |
| Settings | Soften the photo slider (stock 0-100, upload 20-90), live preview, saved on release | 1880, 1939, 1803-1805 | settings/LookSections.tsx:217-232 | TESTED | phase5 "keeps each photo kind on its own slider scale…", "softens the photo from the keyboard…" |
| Settings | Photo credit line under a stock photo | 1797-1802, 1881 | none | DEPARTURE | Plan phase 5: "no photo credit lines until real credits exist" |
| Settings | Hanging: Barnwood, Pegs, Cork, Floating tiles | 1884-1888, 1936-1937 | settings/LookSections.tsx:244-275 | TESTED | phase5 "hangs the records in the style picked" |
| Settings | Discogs username, autosaved; with a token saved it re-verifies | 1892, 1952 | settings/SettingsSheet.tsx:100-109, 144-147 | BUILT-UNTESTED | re-verify on rename not asserted |
| Settings | Token entry: password field, Show/Hide, Save token, link to discogs.com/settings/developers | 1895-1900, 1954 | settings/SettingsSheet.tsx:187-221 | TESTED | phase0 "saves the token to private data, then checks it with the task"; Show/Hide BUILT-UNTESTED |
| Settings | Token validation messages ("doesn't look like a Discogs token", "Add your Discogs username first.", "Sign in to claude.ai…") | 1956-1958 | settings/SettingsSheet.tsx:113-114, runtime/runtime.tsx:471 | TESTED | phase0 (first message); the other two BUILT-UNTESTED |
| Settings | Token saved: ••••last4, Verified as X / Not accepted / Checking…, saved/checked dates, error message | 1856-1861 | settings/SettingsSheet.tsx:148-170 | TESTED | phase0 ("Not accepted"; plan phase 0 P3) |
| Settings | Replace token / Check again / Remove token (confirm) | 1901-1902, 1964, 1981-1986 | settings/SettingsSheet.tsx:171-186, 227-233 | TESTED | phase0 (Remove token), phase5 (Check again); Replace token BUILT-UNTESTED (React adds Cancel) |
| Settings | Discogs import box (verified token): Import from Discogs / Importing… / Try again after 10 min, "background isn't connected" note, last import message and date | 1904-1910, 1965-1976 | settings/SettingsSheet.tsx:41-87 | TESTED | phase5 "starts the import at once…", "offers Try again…", "offers no import until the token is verified…" |
| Settings | Stalled import wording "…Try again to restart it." | 1909 | settings/SettingsSheet.tsx:78 | DIFFERS-UNRECORDED | React drops "Try again to restart it." (button still shown); trivial |
| Settings | Help: Tell us on GitHub, sharing/editors note, version | 1920-1924 | settings/SettingsSheet.tsx:356-370 | TESTED | phase5 "…links to GitHub for help"; note and version BUILT-UNTESTED |

## Discogs sync

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Discogs | Edits to synced fields set needsSync; the task starts 20 s after the last such edit or when the sheet closes | 602, 1389-1391, 1349 | model/edit.ts:44-54, runtime/runtime.tsx:305-323 | TESTED | model/edit.test "flags Discogs sync only for synced fields"; phase0 "closing the sheet after a synced edit starts the task…" |
| Discogs | A release typed in clears the matcher's match ("set by you") | 1367 | model/edit.ts:51-53 | DEPARTURE | Plan phase 6: "a release number typed in records 'set by you'"; tested phase6 "keeps just the number of a pasted link, and makes it the person's own choice" |
| Discogs | Sheet says "Waiting to sync…" and the wall counts it as busy while connected | n/a | sheet/RecordSheet.tsx:155, model/task.ts:49-51 | DEPARTURE | Plan phase 6: "an edit waiting for Discogs shows the lookup dot and count ('Waiting to sync…' in the sheet…)"; tested phase6 |
| Discogs | Release line offers Settings when Discogs isn't connected | n/a | sheet/DiscogsEdit.tsx:91-98 | DEPARTURE | Plan phase 6: "the line offers Settings when Discogs isn't connected"; tested |

## Export and import

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Library | Your library section: explanation, Export your library (only with downloads), Import from a file | 1912-1919 | settings/Library.tsx:271-305 | TESTED | phase6 "Export your library" tests |
| Library | Export: records, gear, setups, look, referenced artists, covers + photo as data URLs (6 at a time), never deleted/example | 1990-2024 | settings/Library.tsx:62-98, model/library.ts:49-66 | TESTED | phase6 "saves the records, gear and look with their covers, never deleted ones"; "the library file" |
| Library | Export messages: "Saving your library…", "Saved N records…", "N covers couldn't be included.", cancel says nothing | 2005, 2019-2021 | settings/Library.tsx:65, 90-95 | TESTED | phase6 "says nothing when the save is cancelled…"; missed-covers line BUILT-UNTESTED |
| Library | Import steps: Choose a file → "Adds N…, M already on the wall and will be skipped" → Bring them in / Choose another file → done "See your wall" | 2026-2045, 2001-2002 | settings/Library.tsx:308-360, model/library.ts:83-133 | TESTED | phase6 "shows what a file adds, skips what is on the wall, and brings the rest in" |
| Library | Import runs in its own sheet | 2026-2045 | settings/SettingsSheet.tsx:250-310 | DEPARTURE | Plan phase 6: "the import runs step by step inside Settings, keeps going when Settings closes and opens on it" |
| Library | Bad file / newer version / nothing new messages | 2049-2050, 2069 | model/library.ts:90-92, 128 | TESTED | phase6 "says when a file isn't a library, or adds nothing" |
| Library | Covers uploaded from the file, progress "Bringing in covers: N of M…", "Bringing in records: N of M…", "Keep this page open until it's done." | 2094-2118, 2032 | settings/Library.tsx:136-177, 326 | BUILT-UNTESTED | progress strings not asserted |
| Library | An empty wall takes the file's look (title, background/photo, dim, hang) and drops an untouched "My setup" | 2119-2137 | settings/Library.tsx:194-219, model/library.ts:191-200 | TESTED | phase6 "gives an empty wall the file's look too"; "My setup" cleanup BUILT-UNTESTED |
| Library | Stopped part-way: "Stopped after N of M records…" and import again | 2143 | settings/Library.tsx:189-191, 338-345 | DEPARTURE | Plan phase 6: "can try the same file again after a stop"; tested phase6 "offers Try again with the same file…" |
| Library | Imported records marked needsSync true | 2087 | model/library.ts:155 ('check') | DEPARTURE | Plan phase 6: "a library load's records are checked quietly" |
| Library | Done message and lookup start ("We'll look up covers or album info for …") | 2138-2142 | model/library.ts:203-214, settings/Library.tsx:188 | TESTED | phase6 "shows what a file adds…" (Brought in …) |

## Share

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Share | Share sheet: "Drawing your wall…", picture of the sleeves the wall shows (filter + search), title, counts line | 2148-2260, 2264-2281 | wall/ShareSheet.tsx:11-130, wall/drawShare.ts, model/share.ts:12-17 | TESTED | share.test "draws what the wall shows and saves it as a picture", "counts what the picture shows", "draws afresh on each opening…" |
| Share | Hanging style rails, rings, pegs, pins; photo background softened; text glow | 2200-2258 | wall/drawShare.ts:469-560 | BUILT-UNTESTED | |
| Share | Pattern backgrounds drawn as plain wall colour | 2151-2152 | wall/drawShare.ts:114, 482 | DEPARTURE | Plan phase 6: "pattern backgrounds are drawn, not left plain" |
| Share | Up to 40 sleeves then "+ N more" | 2153, 2258 | model/share.ts:9, wall/drawShare.ts:588-592 | BUILT-UNTESTED | |
| Share | Tags without prices | 2163-2168 | model/record.ts:241-247 | TESTED | model/wall.test "hang tags" |
| Share | Share (phone share sheet when allowed) and Save image; "Saved." / "Sharing isn't available here…" / "Couldn't save the picture: …" | 2276-2287 | wall/ShareSheet.tsx:58-76, 103-117 | TESTED | share.test "offers the phone's share sheet…", "draws what the wall shows and saves it…"; error strings BUILT-UNTESTED |
| Share | Saved as PNG; buttons below the picture; no narrowing note; "Hang a record first…" on an empty wall | 2262, 2271, 2277-2281 | wall/ShareSheet.tsx:32, 96, 103-122 | DEPARTURE | Plan phase 6: "saved as a 2x JPEG", "the buttons sit above the picture", "the sheet says when the picture is narrowed", "no Share on an empty wall" |
| Share | Fallback without covers/photo when the canvas can't be saved; "Couldn't draw the picture here." | 2272-2275 | wall/drawShare.ts:444-445, wall/ShareSheet.tsx:102 | TESTED | share.test "says so when the picture can't be drawn…", "says when covers couldn't be drawn" (React retries only on SecurityError) |

## Background task and runtime

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Task | Start message lists what's waiting (Parts B, D, L, E, C) in production wording | 1468-1483 | model/task.ts:27-46 | TESTED | model/task.test "lists each kind of waiting work in production wording", "leaves out records a run already tried…", "says to run everything…" |
| Task | fire_trigger via Claude Code Remote with settings.taskId, at most once a minute | 1490-1499 | runtime/runtime.tsx:225-262 | TESTED | phase0 "Find cover & details marks the record and starts the task…" |
| Task | One run at a time; a start asked for meanwhile fires once when it ends, if anything still waits | 1484-1489, 1492 | runtime/runtime.tsx:233-236, 264-283 | TESTED | phase0 "waits for a run under way instead of starting a second" |
| Task | A run mark older than an hour is a dead run | 1487 | model/task.ts:61-62 (20 min since last check-in) | DEPARTURE | Plan phase 6: "check-ins, 20 minutes without one is a dead run"; tested phase0 "lets a run that has stopped checking in go after 20 minutes", model/task.test |
| Task | Follow-up run for what a run left (lookupLeft/syncLeft) | n/a | runtime/runtime.tsx:250, 281 | DEPARTURE | Plan phase 6: "the page starts the next run for what's left"; tested phase0 "follows a run that left records…" |
| Task | Auto lookup for records waiting on album info, at most every 30 min (`vw-lookup`) | 1461-1467 | runtime/runtime.tsx:285-303 | TESTED | phase0 "starts on its own for records waiting on album info, once per 30 minutes" |
| Task | Errors: needs permission / not set up / not available in this view / couldn't start | 1491, 1497, 1500 | runtime/runtime.tsx:232, 247, 256-260 | TESTED | phase0 "says so when the page can't start tasks", "…isn't set up"; phase5 "say nothing when background updates can't run here…" |
| Task | Starts the page makes on its own stay quiet when they can't run | 1491, 1497 (always flashed) | runtime/runtime.tsx:232, 247 (`how?.asked`) | DEPARTURE | Plan phase 5: "a background start the page makes on its own says nothing when it can't run (only one the owner asked for does)"; tested phase5 |
| Runtime | Boot: db, user, assets, mcp, downloads; live snapshots of settings, artists, setups, gear, records (deleted hidden) | 2292-2321 | runtime/runtime.tsx:142-198 | TESTED | covered across suites (fake runtime); S1-S4 phase 0 checks |
| Runtime | Gear snapshots held while gear writes are pending | 2309 | runtime/runtime.tsx:126-136, 391-407 | BUILT-UNTESTED | |
| Runtime | Settings writes only the changed fields (set the whole doc when it doesn't exist yet) | 1846-1854 | runtime/runtime.tsx:200-220 | BUILT-UNTESTED | |
| Runtime | One record write at a time; writes build on the record as stored | 1388-1401 | runtime/runtime.tsx:326-354 | TESTED | slice2 notes test, RecordSheet.test "reports a refused write" |
| Runtime | Page size, line length, first-visit files, time to wall in Chrome | n/a | scripts/check-cdn.mjs:15-21 | DEPARTURE | Plan phase 6: "Page budget 460 KB until phase 8" |

## Viewers and permissions

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Viewers | Editor = canEdit() or isOwner() (falls back on older runtimes) | 2297 | runtime/runtime.tsx:157-160 | TESTED | phase0 "works on a wall published on an older runtime (no user.can)" |
| Viewers | Read-only record sheet: no Edit, Log play, Add note, status buttons, add-why | 1174-1175, 479 | sheet/RecordSheet.tsx:195, sheet/ViewBody.tsx:169, 176 | TESTED | slice2 "shows a reader no controls"; RecordSheet.test "shows no edit controls to a read-only viewer" |
| Viewers | Settings hidden from viewers | 557 | App.tsx:119 | BUILT-UNTESTED | no test checks a viewer has no Settings button |
| Viewers | Busy dot on sleeves for viewers | 638 (everyone) | wall/Wall.tsx:302 (everyone) | TESTED | Wall.test (sleeve label) |

## Errors and notices

| Area | Feature | Production (line) | React (file:line) | Status | Evidence |
|---|---|---|---|---|---|
| Errors | "Loading the wall…", "This page runs inside claude.ai.", "Open this page signed in to claude.ai to see the wall." | 580, 2296, 2322 | App.tsx:25-31, 67-71 | BUILT-UNTESTED | no test asserts these strings |
| Errors | Records snapshot failure: "Couldn't load the wall: …" | 2320 | runtime/runtime.tsx:187-190 | DIFFERS-UNRECORDED | React shows the bare error message (no "Couldn't load the wall:" prefix) plus the no-db or new "lost access… Reload" line |
| Errors | Notices in the page's status line (flash) | 2290 | App.tsx:72-76, sheets' Alert (RecordSheet.tsx:227-231 etc.) | BUILT-UNTESTED | shown as a dismissible Alert; same messages |
| Errors | "Couldn't save: …" on a refused write | 1398 | runtime/runtime.tsx:347-349 | TESTED | RecordSheet.test "reports a refused write" |
| Errors | "Couldn't save settings: …", "Couldn't save equipment: …", "Couldn't add the setup / delete: …" | 1567, 1659, 1712, 1717, 1787, 1852 | runtime/runtime.tsx:214, 399, 417-430 | BUILT-UNTESTED | |
| Errors | "Upload failed: …" for a cover | 1435 | sheet/CoverButton.tsx:25 | TESTED | phase1 "says why an upload failed" |

## Smoke test (dev/test.html, 0.9.4) → React tests

Status: **T** tested in React · **P** partly (the named checks untested) · **U** untested · **M** missing in React · **D** approved departure

| # | Scenario (test.html lines) | React coverage | Status | Untested / notes |
|---|---|---|---|---|
| 1 | Lookups start the task on load (22) | phase0 "starts on its own…" | T | |
| 2 | Filter top want, clear (23-28) | Wall.test "filters by the counts" | T | |
| 3 | Search every word, Escape clears (29-33) | Wall.test "searches…", wall.test "needs every word" | P | Escape |
| 4 | Stats row, badges, last year's play shows its year, none on ordered (34-46) | sheet/phase3, model/phase3 | P | year on an old "Last" play; no stats/Log play on ordered |
| 5 | Equipment Listening summary: totals line, order (ties by hours), follows record changes, row opens record (48-55) | gear/phase4 "Listening summary opens a record" | P | tie order by hours; live update |
| 6 | Badges: most played + 10 h, tie earns nothing, owned only (56-65) | model/phase3 | T | |
| 7 | Log rows compact, thoughts, grouped by month, no delete in view (67-74) | — | U | |
| 8 | Notes edit in place, links (outer bracket, inner bracket, HTTPS caps, javascript: stays text), Edit shows stored text, Delete asks (75-98) | slice2 "edits and deletes a note" | P | the four link edge cases; Edit shows stored text |
| 9 | Edit mode has no separate log list (99) | — | U | |
| 10 | Undo takes play and stylus minutes back (102-107) | gear/phase4 Undo, slice2 Undo | T | |
| 11 | Re-date a play moves its gear entry; delete asks naming gear (108-117) | gear/phase4 delete | P | re-date moves gear entry |
| 12 | Side play + thoughts; tracks: Pick tracks, Log 2 tracks, chips "1 - title", whole side collapses (118-143) | slice2 plays | P | side chips hidden in Tracks mode; "1 - title" chip text |
| 13 | Vibe: unset says so, a stop shows its word, Clear, saved and shown in log (134-138) | slice2 sets vibe 3 | P | unset state, Clear, shown in log row |
| 14 | Owned: note box tops Research; months fold (latest open), folded month opens keeping play card, refolds on reopen (146-155) | — | U | |
| 15 | Hand-typed play / odd date shown as written, blank entry skipped (157-165) | snapshots (no crash only) | U | |
| 16 | Facts order, Recorded on 2 lines, tracks by side with times, runtime in header, grade in words, runout folded (167-181) | summary.test (summary only) | P | facts order, Recorded break, sides + times, runtime, grade words, runout fold |
| 17 | About: artist lede + credit, 5 links then +1, Discogs links with your copy (182-187) | — | M? | artist links appear absent in React (no `.links` render) — feature map to confirm |
| 18 | Tabs: order, About panel, survives Edit/Done, arrow keys, reopens on task tab (188-198) | slice2 "renders every tab" | P | tab kept through Edit/Done; reopen resets; arrows (appica Tabs) |
| 19 | Research on owned via chat; Listening vs Notes split (199-203) | phase2 | P | plays not on Notes tab |
| 20 | Not this artist (204-208) | phase1 | T | |
| 21 | Lookup line, artist-article credit, nothing found, dot + tooltip + spoken hint, count line (211-231) | summary.test, phase1 lookup line | P | aria-label "…, looking up details"; tooltip; count wording is now "Looking up N" (D, phase 4) |
| 22 | Ordered: Status fact, no tabs without About, order card, Edit "The copy you ordered" (232-237) | sheet/phase3 | T | |
| 23 | Tracks: 8 then Show all 17 (238-242) | — | U | |
| 24 | Wanted: Research + About tabs, actions above tabs, no Priority row (243-245) | phase2 | T | |
| 25 | Edit sections follow view, grades in words, runout per side, title/artist in header, pasted link, switch to Own = Got it (247-264) | phase6 runout/link, slice2 edit-mode move | P | section order, grade option words |
| 26 | Add: Hang it waits for kind, keeps typing, hangs wanted (265-274) | phase1 | T | |
| 27 | Copies: label alone no card, one copy card, folded rows, add/remove in Edit, picker, paid prompt, still-wanted on owned (275-322) | phase2, hunt.test | T | sleeve tag highest budget → D (no budget on tags) |
| 28 | Ordered with copy still wanted: Research tab; back to Want restores copies; Ctrl+Enter adds note (323-333) | phase2 "ordered record the copy it ordered" | P | back to Want order; Ctrl+Enter |
| 29 | Research order of sections, first note brings Notes tab, pins, Copy for Claude, Follow up, no URL, blocked clipboard, live save (335-373) | phase2, hunt.test | P | blocked-clipboard fallback; Follow up prompt in UI; first note adds Notes tab |
| 30 | + Want variants and Undo (374-404) | hunt.test, phase2 | T | |
| 31 | Wear: hours to go, Getting close, Replace (406-415) | model/gear.test | T | header pill text |
| 32 | Add equipment: cancel saves nothing, fields saved (416-425) | gear/phase4 first setup | P | Cancel; startHours/ratedHigh fields |
| 33 | Tracking link can't inject attributes (426-431) | React escapes by construction; model/phase3 links | T | |
| 34 | Shop website: https added, links name/address, hint only after typing, js: doesn't link (433-448, 479-485) | model/edit, sheet/phase3 | P | hint timing; Bought links shop name |
| 35 | Move details: Paid/From, focus, $ stripped, new shop drops website, note text, Cancel, empty Save, Edit drops it (450-477) | slice2 status | P | focus on Paid; shop drops website; note text; Edit drops it |
| 36 | Task start has counts, no titles; one run at a time; nothing waiting no extra run (486-509) | task.test, phase0 | T | |
| 37 | Update odd version; bg odd asset id; photo wash 70/83/95 (510-523) | task.test, wall.test | T | |
| 38 | Settings tiles, hanging tiles, Cork saves, unknown falls back (524-538) | phase5, wall.test | T | |
| 39 | Share image draws cork / plank (539-544) | share.test (no real canvas) | P | pixel check needs Chrome → check:cdn |
| 40 | Settings save keeps others' changes (547-551) | — | U | |
| 41 | Import: known fields, fresh sync, covers, artists cleaned, SVG/odd id/failed upload, counts line, hunt copies, new wall's photo (552-619) | phase6 import + library model | P | per-case: SVG cover, odd id, failed upload, artists stripped, done-line counts |
| 42 | Export: copies, covers, artists, photo bg, no missing-cover line (562-571) | phase6 export | P | artists in file; photo bg |
| 43 | No script errors (621) | Boundary/crash test | T | |
