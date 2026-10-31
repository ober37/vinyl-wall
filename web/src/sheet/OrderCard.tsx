import { Fragment } from 'react'
import { copyTitle, wantCopies } from '../model/copies'
import { discogsLinks, orderState, trackUrl } from '../model/orders'
import { OSTAT, orderStatusOf, playDate, shopHref, type Rec } from '../model/record'
import { reachOf, type Shop } from '../model/shops'
import { Facts } from './Facts'
import { link, LinkList } from './Links'

// the shop by name, linked to its website when there is one. A shop on your list (#89) gives its name, its web store
// when the record has no link of its own, and for a local shop how to reach it on a line below (not on an example)
export function shopFrom(r: Rec, s?: Shop): { name: React.ReactNode; reach: React.ReactNode } {
  const href = shopHref(r.shopUrl) || s?.url || ''
  const text = s?.name || r.shop || (href ? new URL(href).hostname.replace(/^www\./, '') : '')
  const name = href ? (
    <a href={href} target="_blank" rel="noopener" className={link}>
      {text} ↗
    </a>
  ) : (
    text
  )
  const R = s && !r.example ? reachOf(s) : []
  const reach = R.length > 0 && (
    <span className="text-foreground-muted mt-0.5 block text-xs">
      {R.map(([t, u], i) => (
        <Fragment key={t}>
          {i ? ' · ' : ''}
          <a href={u} aria-label={`${t} ${s!.name}`} {...(t === 'Map' ? { target: '_blank', rel: 'noopener' } : {})} className={link}>
            {t}
          </a>
        </Fragment>
      ))}
    </span>
  )
  return { name, reach }
}

// The Order tab: the copy ordered as one open card, like a hunt's single copy. Where the order's at first (with a tracking
// link), then the copy's pressing and label, where it's from, what it cost (its budget until something's paid), when it
// was ordered, older order notes, and its Discogs links.
export function OrderCard({ r, shop }: { r: Rec; shop?: Shop }) {
  const c = wantCopies(r)[0]
  const first = c.pressing.split('\n')[0].trim()
  // named as the copy is everywhere else (#121)
  const title = copyTitle(c, 0)
  const track = trackUrl(r.carrier, r.tracking)
  const rows: [string, React.ReactNode][] = [
    [
      'Status',
      <>
        {orderState(r)}
        {track && (
          <>
            {' · '}
            <a href={track} target="_blank" rel="noopener" className={`${link} whitespace-nowrap`}>
              Track ↗
            </a>
          </>
        )}
      </>,
    ],
  ]
  if (c.pressing && first !== title) rows.push(['Pressing', <span className="whitespace-pre-line">{c.pressing}</span>])
  if (c.label || c.catalog)
    rows.push(['Label', <>{c.label}{c.catalog && <span className="text-foreground-muted">{c.label ? ' · ' : ''}{c.catalog}</span>}</>])
  if (r.shop || shopHref(r.shopUrl)) {
    const f = shopFrom(r, shop)
    rows.push(['From', <>{f.name}{f.reach}</>])
  }
  if (r.paid) rows.push(['Paid', '$' + r.paid])
  else if (c.budget) rows.push(['Budget', 'Up to $' + c.budget])
  if (r.orderDate) rows.push(['Ordered', playDate(String(r.orderDate))])
  if (r.orderNotes) rows.push(['Order notes', <span className="whitespace-pre-line">{String(r.orderNotes)}</span>])
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-foreground-intense text-sm font-medium">{title}</h4>
      <Facts rows={rows} />
      <div className="mt-1">
        <LinkList links={discogsLinks(r)} />
      </div>
    </div>
  )
}
