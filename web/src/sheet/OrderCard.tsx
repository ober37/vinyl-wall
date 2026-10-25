import { wantCopies } from '../model/copies'
import { discogsLinks, trackUrl } from '../model/orders'
import { OSTAT, orderStatusOf, playDate, shopHref, type Rec } from '../model/record'
import { Facts } from './Facts'
import { link, LinkList } from './Links'

// the shop by name, linked to its website when there is one
function Shop({ r }: { r: Rec }) {
  const href = shopHref(r.shopUrl)
  if (!href) return <>{r.shop}</>
  return (
    <a href={href} target="_blank" rel="noopener" className={link}>
      {r.shop || new URL(href).hostname.replace(/^www\./, '')} ↗
    </a>
  )
}

// The Order tab: the copy ordered as one open card, like a hunt's single copy. Where the order's at first (with a tracking
// link), then the copy's pressing and label, where it's from, what it cost (its budget until something's paid), when it
// was ordered, older order notes, and its Discogs links.
export function OrderCard({ r }: { r: Rec }) {
  const c = wantCopies(r)[0]
  const first = c.pressing.split('\n')[0].trim()
  const title = c.name || first || 'Your order'
  const track = trackUrl(r.carrier, r.tracking)
  const rows: [string, React.ReactNode][] = [
    [
      'Status',
      <>
        {OSTAT[orderStatusOf(r)]}
        {r.eta ? ', expected ' + playDate(r.eta) : ''}
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
  if (r.shop || shopHref(r.shopUrl)) rows.push(['From', <Shop r={r} />])
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
