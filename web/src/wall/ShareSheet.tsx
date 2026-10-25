import { useEffect, useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@appica/ui-react/drawer'
import { missedNote, narrowedNote, type Shown } from '../model/share'
import { today } from '../model/record'
import { msgOf, useRuntime } from '../runtime/runtime'
import { drawShare } from './drawShare'

// Share your wall: a picture of the sleeves the wall shows, to post (the phone's share sheet) or save. The buttons sit
// above the picture, which runs well past a phone's screen.
export function ShareSheet({ shown, onClose }: { shown: Shown | null; onClose: () => void }) {
  const { site, saveFile } = useRuntime()
  // the picture belongs to the opening that drew it, so a reopened sheet never shows the last one
  type Pic = { file: File; url: string; canShare: boolean; missed: string }
  const [drawn, setDrawn] = useState<{ for: Shown; pic: Pic | 'failed' } | null>(null)
  const [msg, setMsg] = useState('')
  const first = useRef<HTMLButtonElement>(null)
  // focus waits until the sheet has slid in: iOS scrolls a button focused mid-slide "into view" and leaves the sheet off
  // to the side (as the new-record sheet did)
  const [settled, setSettled] = useState(false)
  // the picture's URL is freed once the sheet has slid away (or when the next one replaces it), so it stays while the sheet closes
  const url = useRef('')
  useEffect(() => () => URL.revokeObjectURL(url.current), [])

  useEffect(() => {
    if (!shown) return
    let live = true
    setMsg('')
    drawShare(shown.list, site).then(
      (d) => {
        if (!live) return
        const file = new File([d.blob], `vinyl-wall-${today()}.jpg`, { type: 'image/jpeg' })
        URL.revokeObjectURL(url.current)
        url.current = URL.createObjectURL(file)
        // the phone's own share sheet, where the browser lets this page use it
        let canShare = false
        try {
          canShare = !!navigator.canShare?.({ files: [file] })
        } catch {
          // a browser that can't tell says no
        }
        setDrawn({ for: shown, pic: { file, url: url.current, canShare, missed: missedNote(d.missedCovers, d.missedPhoto) } })
      },
      () => live && setDrawn({ for: shown, pic: 'failed' }),
    )
    return () => {
      live = false
    }
    // drawn once per opening: a snapshot arriving while it's open doesn't redraw it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])
  // while closing, the sheet keeps the picture it had
  const pic = drawn && (!shown || drawn.for === shown) ? drawn.pic : null
  const ready = pic && pic !== 'failed' ? pic : null
  useEffect(() => {
    if (ready && shown && settled) first.current?.focus()
  }, [ready, shown, settled])
  const canShare = !!ready?.canShare
  // on a phone where the page can't open the share sheet itself, the app opens it once the download is allowed
  const viaSave = !canShare && matchMedia('(pointer: coarse)').matches
  const share = async () => {
    try {
      await navigator.share({ files: [ready!.file], title: site.title })
      setMsg('')
    } catch (e) {
      setMsg((e as Error)?.name === 'AbortError' ? '' : "Sharing isn't available here. Save the image instead.")
    }
  }
  const save = async () => {
    try {
      await saveFile(ready!.file.name, ready!.file)
      setMsg('Saved.')
    } catch (e) {
      setMsg((e as { code?: string })?.code === 'declined' ? '' : "Couldn't save the picture: " + msgOf(e))
    }
  }
  const note = shown ? narrowedNote(shown) : ''
  // once the sheet has slid in, focus may move; once it has slid away, the picture is let go
  const done = (open: boolean) => {
    setSettled(open)
    if (open) return
    setDrawn(null)
    URL.revokeObjectURL(url.current)
    url.current = ''
  }

  return (
    <Drawer side="right" open={!!shown} onOpenChange={(o) => !o && onClose()} onOpenChangeComplete={done}>
      <DrawerContent className="w-full sm:max-w-xl">
        <DrawerHeader>
          <DrawerTitle>Share your wall</DrawerTitle>
          <DrawerDescription>A picture of your wall to save or post.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col gap-4 pb-8">
            {note && <p className="text-foreground text-sm">{note}</p>}
            {!pic && (
              <p role="status" className="text-foreground-muted text-sm">
                Drawing your wall…
              </p>
            )}
            {pic === 'failed' && <p className="text-foreground-muted text-sm">Couldn't draw the picture here.</p>}
            {ready && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-3 sm:flex-row *:w-full sm:*:w-auto">
                    {canShare && (
                      <Button ref={first} onClick={share}>
                        Share
                      </Button>
                    )}
                    <Button ref={canShare ? undefined : first} variant={canShare ? 'outline' : 'primary'} onClick={save}>
                      {viaSave ? 'Share or save' : 'Save image'}
                    </Button>
                  </div>
                  {viaSave && <p className="text-foreground-muted text-sm">Allow the download, then choose where it goes.</p>}
                </div>
                <p role="status" className="text-foreground-muted text-sm empty:hidden">
                  {msg}
                </p>
                {ready.missed && <p className="text-foreground-muted text-sm">{ready.missed}</p>}
                <img src={ready.url} alt="Picture of your wall" className="border-border h-auto w-full rounded-(--radius-xs) border" />
              </>
            )}
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
