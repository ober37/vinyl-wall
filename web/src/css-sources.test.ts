// index.css scans only the appica components the app uses (it keeps the page small). This fails when a component is
// imported, directly or by another appica component, without being in that list: it would render unstyled.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const dist = join(__dirname, '../node_modules/@appica/ui-react/dist/components')
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))

it('scans every appica component the app needs', () => {
  const listed = /components\/\{([^}]+)\}/.exec(readFileSync(join(__dirname, 'index.css'), 'utf8'))![1].split(',')
  const need = new Set<string>()
  for (const f of files(__dirname).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)))
    for (const m of readFileSync(f, 'utf8').matchAll(/@appica\/ui-react\/([a-z-]+)['/]/g)) if (!['hooks', 'providers'].includes(m[1])) need.add(m[1])
  // and what those import from each other
  for (const c of [...need]) for (const f of files(join(dist, c)).filter((f) => f.endsWith('.js')))
    for (const m of readFileSync(f, 'utf8').matchAll(/from '\.\.\/([a-z-]+)\//g)) need.add(m[1])
  expect([...need].filter((c) => !listed.includes(c))).toEqual([])
})
