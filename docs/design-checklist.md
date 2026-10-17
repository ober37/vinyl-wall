# Design checklist

Run this before showing any UI change, on every screen the change touches.

## Every mode and state
- [ ] **View and edit.** Each element serves that mode's purpose. Reading and acting (play, log, find, status actions) lives in the view; fields and destructive actions (Remove) live in edit. Nothing appears in both.
- [ ] **Each record status:** owned, ordered and wishlist. Labels, placeholders, empty states and links make sense for that status (no "listening log" for a record you haven't received, no shopping links for one you own).
- [ ] **Empty and full.** Empty wall, empty log, no cover, no equipment, no Discogs. Empty states say what will appear and how to add it, with no stray dashes or zero counts.
- [ ] **New and existing.** The add-a-record form, not just the edit form.
- [ ] **Read-only viewers** (someone the wall is shared with) see no controls they can't use.

## Layout
- [ ] **Phone (390px) and desktop (1200px)**, light and dark, over a photo background and a pattern.
- [ ] No duplicate controls for the same action on one screen.
- [ ] Long values (pressing names, shop names, titles) wrap cleanly, with nothing squeezed into a half column.
- [ ] Touch: everything tappable looks tappable without hover.

## Copy
- [ ] Placeholders read as examples ("e.g. …"), not as data.
- [ ] Headings and prompts match the record's status and the person's situation.
