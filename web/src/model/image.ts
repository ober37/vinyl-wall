// Shrink an image before storing it, as shrinkImage in app/vinyl-wall.html: covers show at about 170px, so a phone photo
// or a 1400px scan is mostly wasted bytes. Keeps the original when it's already small, when the JPEG isn't smaller, or
// when the browser can't decode it (HEIC, say).
export type ImageApi = {
  bitmap: (f: Blob) => Promise<{ width: number; height: number; close?: () => void }>
  encode: (bmp: { width: number; height: number }, w: number, h: number, quality: number) => Promise<Blob | null>
}

const browser: ImageApi = {
  bitmap: (f) => createImageBitmap(f),
  encode: (bmp, w, h, quality) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.drawImage(bmp as ImageBitmap, 0, 0, w, h)
    return new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
  },
}

export async function shrinkImage(file: File, max: number, quality: number, api: ImageApi = browser): Promise<File> {
  try {
    const bmp = await api.bitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (k === 1 && file.size < 250 * 1024) {
      bmp.close?.()
      return file
    }
    const blob = await api.encode(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k), quality)
    bmp.close?.()
    if (!blob || blob.size >= file.size) return file
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
