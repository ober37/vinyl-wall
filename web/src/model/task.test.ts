import { describe, expect, it } from 'vitest'
import type { Rec } from './record'
import { newer, pendingParts, pendingWork, runActive, updateAsk } from './task'

const done: Rec = { id: 'a', coverAsset: 'x', runtime: 40, aboutAt: 1, aboutV: 3, about: { summary: 's' }, discogsSync: {} }
const now = 1_800_000_000_000

describe('what the background task is started with', () => {
  it('lists each kind of waiting work in production wording', () => {
    const recs: Rec[] = [{ id: 'n', needsEnrich: true }, { ...done, id: 'm', needsSync: true }]
    const s = { discogs: { hasToken: true, status: 'ok' }, update: { checkedMs: now } }
    expect(pendingParts(recs, s, false, now)).toEqual([
      'look up covers, details and album info (Part L) for 1 record',
      'sync 2 records to Discogs (Part C)',
    ])
    expect(pendingParts([done], { discogs: { hasToken: true }, update: { checkedMs: now } }, false, now)).toEqual([
      'verify the Discogs connection (Part B)',
    ])
    expect(pendingParts([done], {}, false, now)).toEqual(['check for a newer release (Part E)'])
  })
  it('leaves out records a run already tried, when fresh', () => {
    const tried: Rec = { ...done, coverAsset: undefined }
    expect(pendingParts([tried], { update: { checkedMs: now } }, false, now)).toHaveLength(1)
    expect(pendingParts([tried], { update: { checkedMs: now } }, true, now)).toEqual([])
  })
  it('says to run everything when nothing specific waits', () => {
    expect(pendingWork([done], { update: { checkedMs: Date.now() } })).toBe(
      'Started from the wall. Waiting now: nothing specific; run every part and do whatever is pending.',
    )
  })
  it('treats a run mark older than an hour as a dead run', () => {
    expect(runActive({ run: { startedMs: now - 59 * 60000 } }, now)).toBe(true)
    expect(runActive({ run: { startedMs: now - 61 * 60000 } }, now)).toBe(false)
  })
})

describe('updates', () => {
  it('compares plain versions only', () => {
    expect(newer('1.0.1', '1.0.0')).toBe(true)
    expect(newer('v1.1.0', '1.0.9')).toBe(true)
    expect(newer('1.0.0', '1.0.0')).toBe(false)
    expect(newer('1.0.0-beta', '0.9.4')).toBe(false)
    expect(newer(undefined, '1.0.0')).toBe(false)
  })
  it('asks Claude for the tagged SETUP', () => {
    expect(updateAsk({ update: { latest: '1.0.1' } })).toBe(
      'Update my Vinyl Wall using https://raw.githubusercontent.com/ober37/vinyl-wall/v1.0.1/SETUP.md',
    )
  })
})
