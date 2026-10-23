import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

// Testing Library only unmounts between tests on its own when Vitest globals are on; they're off here
afterEach(cleanup)
// appica animates with Motion; happy-dom rejects an animation cancelled at unmount, so tests skip animations
MotionGlobalConfig.skipAnimations = true
