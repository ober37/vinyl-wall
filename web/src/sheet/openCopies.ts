// for tests: open every folded copy in edit mode's Your copy / Your copies and the copies wanted or ordered (they start
// folded, #121)
import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

export async function openCopies(user: ReturnType<typeof userEvent.setup>) {
  const groups = () => screen.queryAllByRole('group', { name: /^(Your cop(y|ies)|The cop(y|ies) you .+)$/ })
  for (const g of groups()) for (const b of within(g).queryAllByRole('button', { expanded: false })) await user.click(b)
  // an order's Order details shows once its copy is open
  for (const g of groups()) for (const b of within(g).queryAllByRole('button', { name: /^Order details/, expanded: false })) await user.click(b)
}
