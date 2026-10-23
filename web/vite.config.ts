import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { getThemeScript } from '@appica/ui-react/providers/theme-provider'

// ThemeProvider's own script only runs when server-rendered; this page is
// client-only, so put it in <head> to set the theme class before first paint.
const themeScript = () => ({
  name: 'appica-theme-script',
  transformIndexHtml: () => [{ tag: 'script', children: getThemeScript(), injectTo: 'head-prepend' as const }],
})

export default defineConfig({
  plugins: [react(), tailwindcss(), themeScript(), viteSingleFile()],
})
