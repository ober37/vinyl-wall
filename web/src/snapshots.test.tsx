// S1: real walls through the new code. Point VW_SNAPSHOTS at exported wall files (comma-separated paths); they're
// personal data, so they're read from where they are and never committed. Skipped when the variable isn't set.
import { readFileSync } from 'node:fs'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { patchFor, toForm } from './model/edit'
import { shownList } from './model/filter'
import { writtenNotes } from './model/notes'
import { isPlay, keyInfo, playMonths, tagOf, type Rec } from './model/record'
import { siteOf } from './model/site'
import { movePatch } from './model/status'
import { pendingParts } from './model/task'
import { fakeClaude } from './runtime/fake'
import { RuntimeProvider } from './runtime/runtime'

const files = (process.env.VW_SNAPSHOTS || '').split(',').filter(Boolean)
type Snap = { settings?: { site?: Record<string, unknown> }; records: Record<string, Record<string, unknown>>; [k: string]: unknown }

it.skipIf(files.length)('needs VW_SNAPSHOTS (exported wall files) to run', () => {})

describe.each(files)('%s', (file: string) => {
  const snap = JSON.parse(readFileSync(file, 'utf8')) as Snap
  const recs = Object.entries(snap.records).map(([id, r]) => ({ ...r, id }) as Rec)

  it('runs every record and the settings through the model', () => {
    siteOf(snap.settings?.site)
    pendingParts(recs, snap.settings?.site || {}, false)
    expect(shownList(recs, [], '').list).toHaveLength(recs.filter((r) => !r.deleted).length)
    for (const r of recs) {
      const f = toForm(r)
      expect(patchFor(r, f, { ...f }), r.id).toEqual({})
      playMonths(r)
      keyInfo(r)
      tagOf(r)
      writtenNotes(r, isPlay)
      for (const to of ['own', 'ordered', 'wish'] as const) movePatch(r, to)
    }
  })

  it('opens every record in view and edit without a crash', async () => {
    const collections: Record<string, Record<string, Record<string, unknown>>> = {}
    for (const k of ['gear', 'setups', 'artists']) if (snap[k]) collections[k] = snap[k] as Record<string, Record<string, unknown>>
    const fake = fakeClaude({ records: snap.records, docs: { 'settings/site': snap.settings?.site || {} }, collections }, { mcp: 'none' })
    const user = userEvent.setup()
    render(
      <RuntimeProvider claude={fake.claude}>
        <App />
      </RuntimeProvider>,
    )
    await screen.findAllByTestId('sleeve')
    expect(screen.getAllByTestId('sleeve')).toHaveLength(recs.filter((r) => !r.deleted).length)
    for (const r of recs.filter((x) => !x.deleted)) {
      await user.click(document.querySelector(`[data-id="${r.id}"]`)!)
      const sheet = await screen.findByRole('dialog')
      for (const tab of within(sheet).queryAllByRole('tab')) await user.click(tab)
      await user.click(within(sheet).getAllByRole('button', { name: 'Edit' })[0])
      expect(within(sheet).queryByRole('alert'), r.id).toBeNull()
      await user.click(within(sheet).getByRole('button', { name: 'Done' }))
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    // nothing was written just by looking
    expect(fake.calls.filter((c) => c.op !== 'fire')).toEqual([])
  }, 120000)
})
