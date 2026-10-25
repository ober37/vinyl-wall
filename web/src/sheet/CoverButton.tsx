import { useRef, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { shrinkImage } from '../model/image'
import { useRuntime } from '../runtime/runtime'

// Upload cover / Replace cover: picks an image, shrinks it to 500px as production does, stores it, and hands back its id.
// Hidden where this view can't store files.
export function CoverButton({ hasCover, onUploaded, onStatus, disabled }: {
  hasCover: boolean
  onUploaded: (id: string) => void | Promise<void>
  onStatus: (msg: string) => void
  disabled?: boolean
}) {
  const { hasAssets, upload } = useRuntime()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  if (!hasAssets) return null
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
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => input.current?.click()}>
        {hasCover ? 'Replace cover' : 'Upload cover'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label={hasCover ? 'Replace cover' : 'Upload cover'}
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}
