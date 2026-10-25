import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@appica/ui-react/accordion'
import { Button } from '@appica/ui-react/button'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { copiesLegend, copyLabelShown, copyTitle, pickable, stillCopies, type Copy } from '../model/copies'
import { kindOf, type Rec } from '../model/record'
import { Facts } from './Facts'

type Row = [string, React.ReactNode]
const pressRow = (c: Copy): Row[] => (c.pressing ? [['Pressing', <span className="whitespace-pre-line">{c.pressing}</span>]] : [])
const labelRow = (c: Copy, label: string): Row[] =>
  label || c.catalog
    ? [['Label', <>{label}{c.catalog && <span className="text-foreground-muted">{label ? ' · ' : ''}{c.catalog}</span>}</>]]
    : []
const budgetRow = (c: Copy): Row[] => (c.budget ? [['Budget', 'Up to $' + c.budget]] : [])

// The copies a record hunts, as production's wantCopyHTML shows them: one copy on a hunt is an open card (name, pressing,
// label, budget); several, or the copies an owned or ordered record still wants, are folded rows under each copy's title.
// Nothing when there are none.
export function CopiesView({ r, onEditCopy }: { r: Rec; onEditCopy?: (ci: number) => void }) {
  const L = stillCopies(r)
  // a hunt with no copy chosen yet says how to add one, to whoever can
  const none = onEditCopy && kindOf(r) === 'wish' ? <p className="text-foreground-muted text-sm">No copies yet. Add the pressing you're after in Edit.</p> : null
  if (!L.length) return none
  let body: React.ReactNode
  if (L.length === 1 && kindOf(r) === 'wish') {
    const [c, i] = L[0]
    const rows = [...pressRow(c), ...labelRow(c, copyLabelShown(r, c, i) ? c.label : ''), ...budgetRow(c)]
    if (!rows.length && !c.name) return none
    body = (
      <div className="flex flex-col gap-2">
        {c.name && <h4 className="text-foreground-intense text-sm font-medium">{c.name}</h4>}
        {rows.length > 0 && <Facts rows={rows} />}
      </div>
    )
  } else
    body = (
      <Accordion variant="flush" multiple>
        {L.map(([c, i]) => {
          const rows = [...(c.name ? pressRow(c) : []), ...labelRow(c, c.label), ...budgetRow(c)]
          return (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger className="text-foreground text-sm font-medium">
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="min-w-0">{copyTitle(c, i)}</span>
                  {c.budget && <span className="text-foreground-muted shrink-0 font-normal">Up to ${c.budget}</span>}
                </span>
              </AccordionTrigger>
              <AccordionContent>
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
