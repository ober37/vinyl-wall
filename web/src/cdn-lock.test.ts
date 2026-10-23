// The page loads React and appica from jsdelivr at the versions in cdn-lock.json; dev and tests use node_modules.
// This keeps the two the same, and the lock covering every appica component the app imports.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import lock from '../cdn-lock.json'

const installed = (pkg: string) => JSON.parse(readFileSync(join(__dirname, '../node_modules', pkg, 'package.json'), 'utf8')).version
const files = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e): string[] => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]))

it('pins the CDN to the installed versions', () => {
  for (const pkg of ['react', 'react-dom', '@appica/ui-react']) expect(lock.chosen[pkg as keyof typeof lock.chosen], pkg).toBe(installed(pkg))
})

it('has every appica import in the lock (else run npm run cdn:lock)', () => {
  const used = new Set<string>()
  for (const f of files(__dirname).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)))
    for (const m of readFileSync(f, 'utf8').matchAll(/from '(@appica\/ui-react\/[a-z/-]+)'/g)) used.add(m[1])
  expect([...used].filter((u) => !(u in lock.entries))).toEqual([])
})
