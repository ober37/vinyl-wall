import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { shrinkImage } from '../model/image'
import { useRuntime } from '../runtime/runtime'

// Picking a cover: a hidden file input and what opens it. The image is shrunk to 500px as production does, stored, and its
// id handed back. can: this view can store files
export function useCoverPick(hasCover: boolean, onUploaded: (id: string) => void | Promise<void>, onStatus: (msg: string) => void) {
  const { hasAssets, upload } = useRuntime()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    onStatus('Uploading cover…')
    try {
      await onUploaded(await upload(await shrinkImage(file, 500, 0.82)))
    } catch (e) {
      onStatus('Upload failed: ' + ((e as Error).message || String(e)))
    }
    setBusy(false)
  }
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      hidden
      aria-label={hasCover ? 'Replace cover' : 'Upload cover'}
      onChange={(e) => {
        pick(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )
  return { can: hasAssets, busy, open: () => ref.current?.click(), input }
}

// Upload cover / Replace cover as a button. Hidden where this view can't store files.
export function CoverButton({ hasCover, onUploaded, onStatus, disabled }: {
  hasCover: boolean
  onUploaded: (id: string) => void | Promise<void>
  onStatus: (msg: string) => void
  disabled?: boolean
}) {
  const c = useCoverPick(hasCover, onUploaded, onStatus)
  if (!c.can) return null
  return (
    <>
      <Button size="sm" variant="outline" disabled={c.busy || disabled} onClick={c.open}>
        {hasCover ? 'Replace cover' : 'Upload cover'}
      </Button>
      {c.input}
    </>
  )
}
