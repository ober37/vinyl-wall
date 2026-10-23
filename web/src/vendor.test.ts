// The page loads React and appica from the vendor file (web/vendor/); dev and tests use node_modules. This keeps the
// versions the same: after an upgrade, rebuild the vendor (npm run vendor:build), give it a new version and publish it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import vendor from '../vendor/package.json'

const installed = (pkg: string) => JSON.parse(readFileSync(join(__dirname, '../node_modules', pkg, 'package.json'), 'utf8')).version

it('bundles the installed React and appica versions', () => {
  for (const pkg of ['react', 'react-dom', '@appica/ui-react'])
    expect((vendor.bundles as Record<string, string>)[pkg], pkg).toBe(installed(pkg))
})
