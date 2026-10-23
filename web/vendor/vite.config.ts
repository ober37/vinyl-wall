// Builds vendor.js (see entry.ts). Run from web/: npm run vendor:build
import { defineConfig } from 'vite'

export default defineConfig({
  root: import.meta.dirname,
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: import.meta.dirname,
    minify: true,
    emptyOutDir: false,
    lib: { entry: 'entry.ts', formats: ['es'], fileName: () => 'vendor.js' },
    // library mode keeps ES output unminified; nobody reads this file, so minify it at the bundler
    rollupOptions: {
      output: { minify: true },
      onwarn: (w, warn) => (w.code === 'NAMESPACE_CONFLICT' || w.code === 'AMBIGUOUS_EXTERNAL_NAMESPACES' ? (() => { throw new Error(w.message) })() : warn(w)),
    },
  },
})
