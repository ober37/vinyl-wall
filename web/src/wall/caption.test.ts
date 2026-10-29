// #97: a blur behind the light-mode captions made the sleeves flicker under the mouse in Brave on macOS, so the wall
// draws no blur, filter or blend behind them, and the label is solid enough to read without one
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'wall.css'), 'utf8')
const rule = /:root:not\(\.dark\) \.cap \{([^}]*)\}/.exec(css)![1]

it('light-mode captions have no blur, filter or blend behind them', () => {
  expect(rule).not.toMatch(/backdrop-filter|(^|\s)filter:|mix-blend/)
  // the only backdrop-filter left on the wall turns one off
  expect([...css.matchAll(/backdrop-filter:\s*([^;]+);/g)].map((m) => m[1])).toEqual(['none', 'none'])
})

it("the caption label is at least 85% paper, so the artist line keeps 4.5:1 over a dark photo", () => {
  expect(+/--frost: color-mix\(in srgb, var\(--sheet\) (\d+)%/.exec(rule)![1]).toBeGreaterThanOrEqual(85)
})
