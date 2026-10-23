// After a vendor build: record in vendor/package.json which React and appica versions vendor.js holds (src/vendor.test.ts
// checks they're still the installed ones). Publishing a changed vendor.js also needs a new vendor version.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..')
const version = (pkg) => JSON.parse(readFileSync(join(dir, 'node_modules', pkg, 'package.json'), 'utf8')).version
const file = join(dir, 'vendor/package.json')
const p = JSON.parse(readFileSync(file, 'utf8'))
p.bundles = Object.fromEntries(['react', 'react-dom', '@appica/ui-react'].map((k) => [k, version(k)]))
writeFileSync(file, JSON.stringify(p, null, 2) + '\n')
console.log('vendor bundles', p.bundles)
