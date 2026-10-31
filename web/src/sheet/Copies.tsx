import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { buyHosts, copiesLegend, copyBarcode, copyLabelShown, copyTitle, pickable, releaseText, stillCopies, type Copy } from '../model/copies'
import { kindOf, today, type Rec } from '../model/record'
import { shopOrder, type Shop } from '../model/shops'
import { Facts } from './Facts'
import { LinkList } from './Links'

type Row = [string, React.ReactNode]
const pressRow = (c: Copy): Row[] => (c.pressing ? [['Pressing', <span className="whitespace-pre-line">{c.pressing}</span>]] : [])
const labelRow = (c: Copy, label: string): Row[] =>
  label || c.catalog
    ? [['Label', <>{label}{c.catalog && <span className="text-foreground-muted">{label ? ' · ' : ''}{c.catalog}</span>}</>]]
    : []
// a pre-order's release date (#75)
const releaseRow = (c: Copy): Row[] => {
  const t = releaseText(c.releaseDate, today())
  return t ? [['Release', t]] : []
}
const budgetRow = (c: Copy): Row[] => (c.budget ? [['Budget', 'Up to $' + c.budget]] : [])
// where to buy it: each link by its site, one a line, opening in a new tab
const buyRow = (c: Copy): Row[] => {
  const L = buyHosts(c.buyLinks)
  return L.length ? [['Where to buy', <LinkList links={L} />]] : []
}

// this exact pressing at each shop that opens a product by barcode (#88), from the copy's own Discogs release: a page that
// only exists while the shop carries it, so the row asks to check rather than promising it's there
const barcodeRow = (c: Copy, shops: Shop[]): Row[] => {
  const code = copyBarcode(c)
  const L = code ? shopOrder(shops.filter((s) => s.upc)).map((s): [string, string] => [s.name, s.upc!.replace('{upc}', code)]) : []
  return L.length ? [['Check this pressing at', <LinkList links={L} />]] : []
}

// The copies a record hunts, as production's wantCopyHTML shows them: folded rows under each copy's title, one too, as
// every copy is (#121). Nothing when there are none.
// shops: the owner's, for the barcode shops' links
// got: what goes at the foot of a copy's row (Got this copy, on an owned record the owner can edit)
export function CopiesView({ r, onEditCopy, shops = [], got }: {
  r: Rec
  onEditCopy?: (ci: number) => void
  shops?: Shop[]
  got?: (ci: number) => React.ReactNode
}) {
  const L = stillCopies(r)
  // a hunt with no copy chosen yet says how to add one, to whoever can
  const none = onEditCopy && kindOf(r) === 'wish' ? <p className="text-foreground-muted text-sm">No copies yet. Add the pressing you're after in Edit.</p> : null
  if (!L.length) return none
  // a lone label shows only when it names the copy (copyLabelShown)
  const rowsOf = (c: Copy, i: number) => [
    ...(c.name ? pressRow(c) : []), ...labelRow(c, copyLabelShown(r, c, i) ? c.label : ''), ...releaseRow(c), ...budgetRow(c), ...buyRow(c), ...barcodeRow(c, shops),
  ]
  // a hunt's one copy with nothing in it isn't a copy yet
  if (L.length === 1 && kindOf(r) === 'wish' && !L[0][0].name && !rowsOf(...L[0]).length) return none
  const body = (
    <Accordion variant="flush" multiple>
      {L.map(([c, i]) => {
        const rows = rowsOf(c, i)
        return (
          <AccordionItem key={i} value={String(i)}>
            <AccordionTrigger className="text-foreground text-sm font-medium">
              <span className="flex w-full items-baseline justify-between gap-3">
                <span className="min-w-0">{copyTitle(c, i)}</span>
                {c.budget && <span className="text-foreground-muted shrink-0 font-normal">Up to ${c.budget}</span>}
              </span>
            </AccordionTrigger>
            {/* room for a focus ring (Got this copy's form), which the fold's clipping would cut */}
            <AccordionContent className="-mx-1 px-1">
              <div className="flex flex-col gap-3 pt-1">
                {rows.length ? (
                  <Facts rows={rows} />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-foreground-muted text-sm">No pressing or budget yet</span>
                    {onEditCopy && (
                      <Button size="sm" variant="ghost" onClick={() => onEditCopy(i)}>
                        Edit
                      </Button>
                    )}
                  </div>
                )}
                {got?.(i)}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
  return (
    <Fieldset>
      <FieldsetLegend>{copiesLegend(r)}</FieldsetLegend>
      {body}
    </Fieldset>
  )
}

// Moving a hunt with several copies asks which one was got or ordered, one tap per copy; the others stay on the record as
// copies still wanted
export function CopyPicker({ r, to, onPick, onCancel }: { r: Rec; to: 'own' | 'ordered'; onPick: (ci: number) => void; onCancel: () => void }) {
  const got = to === 'own'
  return (
    <div role="group" aria-labelledby="pickQ" className="flex flex-col gap-3">
      <p id="pickQ" className="text-foreground text-sm">
        Which copy {got ? 'did you get' : 'did you order'}? The other copies stay on this record as copies you still want.
      </p>
      <div className="flex flex-col gap-2">
        {pickable(r).map((c, i) => (
          <Button key={i} variant="outline" className="h-auto justify-between gap-3 py-2.5 text-start whitespace-normal" onClick={() => onPick(i)}>
            <span>
              {got ? 'Got' : 'Ordered'}: {copyTitle(c, i)}
            </span>
            {c.budget && <span className="text-foreground-muted shrink-0 font-normal">Up to ${c.budget}</span>}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="-ms-4 self-start" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
