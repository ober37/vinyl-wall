import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

// Testing Library only unmounts between tests on its own when Vitest globals are on; they're off here
afterEach(cleanup)
// appica animates with Motion; happy-dom rejects an animation cancelled at unmount, so tests skip animations
MotionGlobalConfig.skipAnimations = true

// Node 25's own experimental localStorage shadows happy-dom's and has no clear() or Storage prototype: use a real one
class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
