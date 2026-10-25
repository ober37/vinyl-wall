import { Button } from '@appica/ui-react/button'

// Start your wall: an owner's empty wall until they add a record or choose to start blank (production's #welcome).
// On phones a step's button drops under its sentence; from sm up the buttons share one column, so both edges line up.
export function Welcome({ discogsDone, gearDone, onAdd, onDiscogs, onGear, onBlank, onImport }: {
  discogsDone: boolean
  gearDone: boolean
  onAdd: () => void
  onDiscogs: () => void
  onGear: () => void
  onBlank: () => void
  // Settings' Import from a file: an empty wall also takes the file's look
  onImport: () => void
}) {
  const steps = [
    { title: 'Add your first record', text: "Something you own, or one you're hunting for.", button: 'Add a record', primary: true, on: onAdd },
    {
      title: 'Connect Discogs',
      text: "Optional. Keeps your collection and wantlist in sync, and can bring in records you've already listed there.",
      button: 'Open Settings',
      done: discogsDone,
      on: onDiscogs,
    },
    {
      title: 'Add your turntable and stylus',
      text: 'Optional. Plays add up so you know when a stylus is wearing out.',
      button: 'Set up equipment',
      done: gearDone,
      on: onGear,
    },
  ]
  return (
    <section
      aria-labelledby="welcome-title"
      className="border-border flex max-w-180 flex-col gap-6 rounded-xl border bg-[color-mix(in_srgb,var(--sheet)_88%,transparent)] p-4 shadow-[0_10px_30px_var(--shadow-tone)] sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <h2 id="welcome-title" className="font-display text-ink text-[1.625rem] leading-none font-semibold tracking-[0.06em] uppercase">
          Start your wall
        </h2>
        <p className="text-foreground-muted max-w-[58ch]">
          Hang the records you'd keep top to bottom. Add one with just the artist and album: the cover, year, label and runtime are looked up for
          you.
        </p>
      </div>
      <ol className="grid grid-cols-[2rem_1fr] sm:grid-cols-[2rem_1fr_auto]">
        {steps.map((s, i) => (
          <li key={s.title} className="border-(--line) col-span-full grid grid-cols-subgrid items-start gap-x-3 border-t py-4 last:pb-0">
            <span
              className={`grid size-8 place-items-center rounded-full border font-mono text-sm ${s.done ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-foreground-muted'}`}
            >
              {s.done ? <span aria-hidden="true">✓</span> : i + 1}
              {s.done && <span className="sr-only">, done</span>}
            </span>
            <div className="flex min-w-0 flex-col">
              {/* one circle tall, so the circle sits on the step's first line however the sentence wraps */}
              <b className="text-foreground-intense leading-8 font-semibold">{s.title}</b>
              <span className="text-foreground-muted text-sm">{s.text}</span>
            </div>
            <Button
              size="sm"
              variant={s.primary ? 'primary' : 'outline'}
              onClick={s.on}
              className="col-start-2 mt-3 justify-self-start sm:col-start-3 sm:row-start-1 sm:mt-0 sm:w-full sm:self-center"
            >
              {s.button}
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={onBlank}>
          Start blank
        </Button>
        <span className="text-foreground-muted text-sm">Skip this and hang records as you go.</span>
      </div>
      <p className="text-foreground-muted text-sm">
        Moving from another wall?{' '}
        <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={onImport}>
          Import from a file
        </button>
      </p>
    </section>
  )
}
