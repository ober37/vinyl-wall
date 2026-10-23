import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { getThemeScript } from '@appica/ui-react/providers/theme-provider'

// ThemeProvider's own script only runs when server-rendered; this page is
// client-only, so put it in <head> to set the theme class before first paint.
const themeScript = () => ({
  name: 'appica-theme-script',
  transformIndexHtml: () => [{ tag: 'script', children: getThemeScript(), injectTo: 'head-prepend' as const }],
})

// The background photos are published beside the page (SETUP.md's files), never inlined; in dev, serve them from app/
const backgrounds = () => ({
  name: 'dev-backgrounds',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use: (path: string, fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use('/backgrounds', (req, res, next) => {
      const name = (req.url || '').replace(/^\//, '').split('?')[0]
      if (!/^[a-z0-9-]+\.jpg$/.test(name)) return next()
      res.setHeader('Content-Type', 'image/jpeg')
      res.end(readFileSync(resolve(__dirname, '../app/backgrounds', name)))
    })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), themeScript(), backgrounds(), viteSingleFile()],
})
