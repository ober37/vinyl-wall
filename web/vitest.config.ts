import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(readFileSync(resolve(__dirname, '../VERSION'), 'utf8').trim()) },
  test: { environment: 'happy-dom', css: false, setupFiles: ['./src/test-setup.ts'] },
})
