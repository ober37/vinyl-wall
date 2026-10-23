import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import vendor from './vendor/package.json' with { type: 'json' }

const VERSION = readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf8').trim()
const define = { __APP_VERSION__: JSON.stringify(VERSION) }
// release.yml and dev/build_web.py read the version here: a minifier can rename the constant, never this
const versionMeta = () => ({
  name: 'version-meta',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'vinyl-wall-version', content: VERSION }, injectTo: 'head-prepend' as const }],
})
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
      res.end(readFileSync(resolve(import.meta.dirname, '../app/backgrounds', name)))
    })
  },
})

// React and appica load from one vendor file (web/vendor/, published to npm and served by jsdelivr), so the page holds
// only the app's own code and stays readable for SETUP, which has Claude read it before publishing it. One file means one
// copy of each library and its shared state: jsdelivr's per-component files each carry their own (#60).
// BUNDLE=1 builds the fallback instead: one self-contained file with everything inlined.
export const VENDOR_URL = `https://cdn.jsdelivr.net/npm/${vendor.name}@${vendor.version}/vendor.js`
const external = (id: string) => /^(react|react-dom|@appica\/ui-react)(\/|$)/.test(id)

export default defineConfig(({ command }) =>
  process.env.BUNDLE || command === 'serve'
    ? { define, plugins: [react(), tailwindcss(), themeScript(), versionMeta(), backgrounds(), viteSingleFile()] }
    : {
        define,
        plugins: [react(), tailwindcss(), themeScript(), versionMeta(), viteSingleFile()],
        build: { minify: false, rollupOptions: { external, output: { paths: () => VENDOR_URL } } },
      },
)
