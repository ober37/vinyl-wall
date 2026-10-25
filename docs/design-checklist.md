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
- [ ] No duplicate controls for the same action on one screen. Exception: on an empty wall, the welcome card's Add a record and the header's + (icon only on phones) both stay.
- [ ] Long values (pressing names, shop names, titles) wrap cleanly, with nothing squeezed into a half column.
- [ ] Touch: everything tappable looks tappable without hover.

## Spacing and alignment
- [ ] **One gap per level, the same in every sheet.** A new screen reuses these, never a one-off value or a negative margin to pull something closer (the one allowed negative margin pulls a text-only button or a display face back so its letters sit on the left edge).

  | Level | Gap |
  |---|---|
  | Between a sheet's sections (fieldsets) | `gap-8` |
  | Between the blocks of a view (a tab's summaries, logs, lists) | `gap-6` |
  | Inside a section (its fields and field grids; appica's `Fieldset` default) | `gap-4` |
  | A row of buttons or inline items; a card's own blocks | `gap-3` |
  | Inside a group (a label and its field, a heading and its sentence) | `gap-2` |
  | Chips, badges and list rows packed together | `gap-1.5` |

- [ ] **Even gaps around a row.** The space above a row matches the space below it.
- [ ] **One left edge.** Text, fields, tiles, buttons and cards in a column start on the same line. Check each element's own padding (a chip's or ghost button's text sits inside it), and give every item in a row its outline or none, so the edge is visible.
- [ ] **Right edges and centres.** A control held to the right lines up with the one above it; things side by side are centred on each other and the same size when they're the same kind.
- [ ] **An add belongs to its list.** "Add another" sits at the list's spacing as the list's last slot, not tucked under the item above it.
- [ ] **Looks alike, acts alike.** Something that isn't a control (a count, a status) doesn't wear a control's outline.

## Copy
- [ ] Placeholders read as examples ("e.g. …"), not as data. Exception: a placeholder that is the value used when the field is empty (the wall's title, "My Vinyl Wall").
- [ ] Headings and prompts match the record's status and the person's situation.
