import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { countsLine, missedNote, narrowedNote } from '../model/share'
import type { Rec } from '../model/record'
import { fakeClaude } from '../runtime/fake'
import { RuntimeProvider } from '../runtime/runtime'
import { sample } from '../runtime/sample'
import { drawShare } from './drawShare'

// the canvas itself is checked in the built page; here, what's handed to it and what the sheet does with the picture
vi.mock('./drawShare', () => ({ drawShare: vi.fn() }))
const draw = vi.mocked(drawShare)

type Opts = Parameters<typeof fakeClaude>[1]
function setup(opts: Opts = {}, empty = false) {
  const seed = sample()
  if (empty) seed.records = {}
  const fake = fakeClaude(seed, opts)
  render(
    <RuntimeProvider claude={fake.claude}>
      <App />
    </RuntimeProvider>,
  )
  return { fake, user: userEvent.setup() }
}
const shareBtn = () => screen.queryByRole('button', { name: 'Share your wall' })
const openShare = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findAllByTestId('sleeve')
  await user.click(shareBtn()!)
  return screen.findByRole('dialog', { name: 'Share your wall' })
}

beforeEach(() => {
  localStorage.clear()
  draw.mockReset()
  draw.mockResolvedValue({ blob: new Blob(['png'], { type: 'image/png' }), missedCovers: 0, missedPhoto: false })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pic')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the share picture’s words', () => {
  const rec = (status: string, priority?: number) => ({ id: status + priority, status, priority }) as Rec
  it('counts what the picture shows', () => {
    expect(countsLine([rec('own'), rec('own'), rec('ordered'), rec('wish', 1)])).toBe('2 owned  ·  1 on the way  ·  1 top want')
  })
  it('says when the picture is narrowed, and only then', () => {
    const of = (n: number, filtered: boolean, searched: boolean) => narrowedNote({ list: Array(n).fill(rec('own')), total: 40, filtered, searched })
    expect(of(12, true, false)).toBe('12 of 40 records, as filtered.')
    expect(of(3, false, true)).toBe('3 of 40 records, as searched.')
    expect(of(2, true, true)).toBe('2 of 40 records, as filtered and searched.')
    expect(of(40, true, false)).toBe('')
  })
  it('names what couldn’t be drawn', () => {
    expect(missedNote(0, false)).toBe('')
    expect(missedNote(1, false)).toBe("A cover couldn't be drawn, so it shows as a plain sleeve.")
    expect(missedNote(3, true)).toBe(
      "Some covers couldn't be drawn, so they show as plain sleeves. The background photo couldn't be drawn, so the picture uses the plain wall color.",
    )
  })
})

describe('Share your wall', () => {
  it('draws what the wall shows and saves it as a picture', async () => {
    const { fake, user } = setup()
    const sheet = await openShare(user)
    await user.click(await within(sheet).findByRole('button', { name: 'Save image' }))
    expect(draw.mock.calls[0][0].map((r) => r.id)).toEqual(['r1', 'r3', 'r5', 'r7', 'r6'])
    expect(within(sheet).getByRole('img', { name: 'Picture of your wall' })).toBeTruthy()
    expect(within(sheet).queryByText(/ of \d+ records/)).toBeNull()
    await waitFor(() => expect(within(sheet).getByText('Saved.')).toBeTruthy())
    expect(fake.saved[0].filename).toMatch(/^vinyl-wall-\d{4}-\d\d-\d\d\.jpg$/)
  })

  it('follows the filter and says the picture is narrowed', async () => {
    const { user } = setup()
    await screen.findAllByTestId('sleeve')
    await user.click(screen.getByRole('button', { name: /on the way/ }))
    const sheet = await openShare(user)
    expect(draw.mock.calls[0][0].map((r) => r.id)).toEqual(['r5'])
    expect(within(sheet).getByText('1 of 5 records, as filtered.')).toBeTruthy()
  })

  it('offers the phone’s share sheet where the browser allows it', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true, share }))
    const { user } = setup()
    const sheet = await openShare(user)
    const btn = await within(sheet).findByRole('button', { name: 'Share' })
    await waitFor(() => expect(document.activeElement).toBe(btn))
    await user.click(btn)
    expect(share).toHaveBeenCalledOnce()
  })

  it('on a phone that can only save, says the save leads to sharing', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }))
    const { user } = setup()
    const sheet = await openShare(user)
    expect(await within(sheet).findByRole('button', { name: 'Share or save' })).toBeTruthy()
    expect(within(sheet).getByText('Allow the download, then choose where it goes.')).toBeTruthy()
  })

  it('says when covers couldn’t be drawn', async () => {
    draw.mockResolvedValueOnce({ blob: new Blob(['png']), missedCovers: 2, missedPhoto: false })
    const { user } = setup()
    const sheet = await openShare(user)
    expect(await within(sheet).findByText("Some covers couldn't be drawn, so they show as plain sleeves.")).toBeTruthy()
  })

  it('draws afresh on each opening, for what the wall shows then', async () => {
    const { user } = setup()
    let sheet = await openShare(user)
    await within(sheet).findByRole('img', { name: 'Picture of your wall' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: /on the way/ }))
    draw.mockReturnValueOnce(new Promise(() => {}))
    sheet = await openShare(user)
    expect(within(sheet).getByText('Drawing your wall…')).toBeTruthy()
    expect(within(sheet).queryByRole('img')).toBeNull()
    expect(draw.mock.calls[1][0].map((r) => r.id)).toEqual(['r5'])
  })

  it('says so when the picture can’t be drawn, without blaming the covers', async () => {
    draw.mockRejectedValueOnce(new Error('empty'))
    const { user } = setup()
    const sheet = await openShare(user)
    expect(await within(sheet).findByText("Couldn't draw the picture here.")).toBeTruthy()
    expect(draw).toHaveBeenCalledOnce()
  })

  it('is there for viewers, but not on an empty wall or where files can’t be saved', async () => {
    setup({ canWrite: false })
    await screen.findAllByTestId('sleeve')
    expect(shareBtn()).toBeTruthy()
    cleanup()
    setup({ downloads: 'none' })
    await screen.findAllByTestId('sleeve')
    expect(shareBtn()).toBeNull()
    cleanup()
    setup({ canWrite: false }, true)
    await screen.findByText('Nothing hanging yet.')
    expect(shareBtn()).toBeNull()
  })
})
