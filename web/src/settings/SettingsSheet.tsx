import { useEffect, useRef, useState } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@appica/ui-react/alert'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import { CopyButton } from '@appica/ui-react/copy-button'
import { Drawer, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody } from '@appica/ui-react/drawer'
import { SheetContent } from '../wall/Tip'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { longDate, today } from '../model/record'
import { newer, updateAsk } from '../model/task'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { APP_VERSION } from '../version'
import { ImportView, LibrarySection, useLibrary } from './Library'
import { BackgroundSection, HangingSection, PageSection } from './LookSections'
import { ShopsSection } from './Shops'

// a stored date as the page shows dates (Oct 23, 2026); the task's check-in time ("2026-10-25 20:05 UTC") on this
// device's own calendar, so a check just after a save isn't dated the next day
const day = (d: unknown) => {
  const s = String(d || '')
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d) UTC$/.exec(s)
  if (!m) return longDate(s.slice(0, 10))
  const t = new Date(`${m[1]}T${m[2]}Z`)
  const pad = (n: number) => String(n).padStart(2, '0')
  return longDate(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`)
}

// an update is offered only on the owner's own wall with background updates set up (production's updateState)
export function useUpdateAvailable() {
  const { canEdit, hasMcp, settings } = useRuntime()
  return canEdit && hasMcp && !!settings.taskId && newer(settings.update?.latest, APP_VERSION)
}

type Discogs = {
  username?: string
  hasToken?: boolean
  last4?: string
  status?: string
  msg?: string
  verifiedUser?: string
  savedAt?: string
  checkedAt?: string
  importRequested?: boolean
  importRequestedAt?: number
  importMsg?: string
  importedAt?: string
}

const STALL = 10 * 60000
// Bring in what's already on Discogs: asks the background task for part D, which adds what isn't on the wall yet
function DiscogsImport({ dz }: { dz: Discogs }) {
  const { settings, saveSettings, fireTask, hasMcp } = useRuntime()
  const [, redraw] = useState(0)
  const stalled = !!dz.importRequested && Date.now() - (dz.importRequestedAt || 0) > STALL
  // a waiting import turns into Try again without reopening Settings
  useEffect(() => {
    if (!dz.importRequested || stalled) return
    const t = setTimeout(() => redraw((n) => n + 1), (dz.importRequestedAt || 0) + STALL + 1000 - Date.now())
    return () => clearTimeout(t)
  }, [dz.importRequested, dz.importRequestedAt, stalled])
  const ask = () => saveSettings({ discogs: { importRequested: true, importRequestedAt: Date.now() } }).then(() => fireTask({ now: true, asked: true }))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <p className="text-foreground-intense text-sm font-semibold">Bring in what's already on Discogs</p>
        <p className="text-foreground-muted text-sm">
          Adds the records in your Discogs collection and wantlist that aren't on the wall yet. Covers are looked up for you, and
          nothing already on the wall changes.
        </p>
      </div>
      {!hasMcp || !settings.taskId ? (
        <p className="text-foreground-muted text-sm">Importing runs in the background, which isn't connected for this page. Open your own wall to import.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="outline" disabled={dz.importRequested} onClick={ask}>
              {dz.importRequested ? 'Importing…' : 'Import from Discogs'}
            </Button>
            {stalled && (
              <Button size="sm" variant="outline" onClick={ask}>
                Try again
              </Button>
            )}
          </div>
          <p role="status" className="text-foreground-muted text-sm empty:hidden">
            {dz.importRequested
              ? stalled
                ? 'This is taking longer than it should. Try again to restart it.'
                : 'This takes a few minutes. Records appear on the wall as they come in.'
              : dz.importMsg || ''}
            {!dz.importRequested && dz.importedAt && <span className="font-mono"> ({dz.importedAt})</span>}
          </p>
        </>
      )}
    </div>
  )
}

function DiscogsSection({ focus }: { focus?: boolean }) {
  const { settings, saveSettings, saveToken, removeToken, fireTask } = useRuntime()
  const dz = (settings.discogs || {}) as Discogs
  const [user, setUser] = useState(dz.username || '')
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [status, setStatus] = useState('')
  const [confirm, setConfirm] = useState(false)
  const userTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // the username saves as it's typed; with a token saved, a new name needs checking again
  const typeUser = (u: string) => {
    setUser(u)
    clearTimeout(userTimer.current)
    userTimer.current = setTimeout(() => {
      saveSettings({ discogs: { username: u.trim(), ...(dz.hasToken ? { status: 'pending' } : {}) } })
      if (dz.hasToken) fireTask()
    }, 800)
  }
  useEffect(() => () => clearTimeout(userTimer.current), [])

  const save = async () => {
    const v = token.trim()
    if (!/^[A-Za-z0-9]{20,64}$/.test(v)) return setStatus("That doesn't look like a Discogs token. It should be a long string of letters and numbers.")
    if (!user.trim()) return setStatus('Add your Discogs username first.')
    setStatus('Saving…')
    try {
      await saveToken(v)
      setToken('')
      setReplacing(false)
      await saveSettings({
        discogs: { username: user.trim(), hasToken: true, last4: v.slice(-4), savedAt: today(), status: 'pending', msg: '', verifiedUser: '', checkedAt: '' },
      })
      setStatus('')
      fireTask({ asked: true })
    } catch (e) {
      const x = e as { message?: string; code?: string }
      setStatus(x.code === 'signed-out' ? x.message! : "Couldn't save the token: " + (x.message || String(e)))
    }
  }
  const remove = async () => {
    try {
      await removeToken()
      await saveSettings({ discogs: { username: dz.username || '', hasToken: false, last4: '', status: '', msg: '', verifiedUser: '', savedAt: '', checkedAt: '' } })
    } catch (e) {
      setStatus("Couldn't remove it: " + ((e as { message?: string }).message || String(e)))
    }
  }

  return (
    <Fieldset>
      <div className="flex flex-col gap-2">
        <FieldsetLegend>Discogs</FieldsetLegend>
        <p className="text-foreground-muted text-sm">Connect your Discogs account to keep your collection and wantlist in sync with the wall.</p>
      </div>
      <Field>
        <FieldLabel>Username</FieldLabel>
        <Input value={user} onChange={(e) => typeUser(e.target.value)} autoComplete="off" autoCapitalize="off" autoFocus={focus} />
      </Field>
      {dz.hasToken && (
        <div className="bg-wall flex flex-wrap items-center gap-3 rounded-(--radius-xs) p-3">
          <span className="font-mono text-sm tracking-wider">••••••••{dz.last4}</span>
          {dz.status === 'ok' ? (
            <Badge size="sm" variant="success">
              Verified{dz.verifiedUser ? ' as ' + dz.verifiedUser : ''}
            </Badge>
          ) : dz.status === 'error' ? (
            <Badge size="sm" variant="error">
              Not accepted
            </Badge>
          ) : (
            <Badge size="sm" variant="warning">
              Checking…
            </Badge>
          )}
          <span className="text-foreground-muted text-xs">
            Saved {day(dz.savedAt)}
            {dz.checkedAt ? ' · checked ' + day(dz.checkedAt) : ''}
          </span>
        </div>
      )}
      {dz.hasToken && dz.status === 'error' && dz.msg && <p className="text-error-emphasis text-sm">{dz.msg}</p>}
      {dz.hasToken && !replacing ? (
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="outline" onClick={() => setReplacing(true)}>
            Replace token
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveSettings({ discogs: { status: 'pending' } }).then(() => fireTask({ asked: true }))}
          >
            Check again
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
            Remove token
          </Button>
        </div>
      ) : (
        <Field>
          <FieldLabel>Personal access token</FieldLabel>
          <div className="flex flex-wrap gap-3">
            <Input
              type={show ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste your token"
              className="min-w-0 flex-1 basis-full font-mono sm:basis-0"
            />
            <Button size="sm" variant="outline" onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'}
            </Button>
            <Button size="sm" onClick={save}>
              Save token
            </Button>
            {replacing && (
              <Button size="sm" variant="outline" onClick={() => setReplacing(false)}>
                Cancel
              </Button>
            )}
          </div>
          <FieldDescription>
            Create one at{' '}
            <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
              discogs.com/settings/developers
            </a>{' '}
            → Generate new token.
          </FieldDescription>
        </Field>
      )}
      {status && (
        <p role="status" className="text-foreground-muted text-sm">
          {status}
        </p>
      )}
      <Confirm
        open={confirm}
        title="Remove your token? Syncing with Discogs stops until you add one again."
        yes="Remove token"
        onYes={remove}
        onClose={() => setConfirm(false)}
      />
      {dz.hasToken && dz.status === 'ok' && <DiscogsImport dz={dz} />}
    </Fieldset>
  )
}

const REPO_URL = 'https://github.com/ober37/vinyl-wall'

// Four tabs: Wall (how it looks), Shops (where to look for a copy), Library (Discogs, export and import) and About; people who can't edit see only About.
// at: 'discogs' opens it on Library with the username ready (the welcome card's Connect Discogs); 'import' on the import
// (as does an import under way, or one finished while Settings was closed)
export function SettingsSheet({ open, at, onClose }: { open: boolean; at?: 'top' | 'discogs' | 'import'; onClose: () => void }) {
  const { settings, canEdit, hasMcp, fireTask, error, notice, clearError } = useRuntime()
  const update = useUpdateAvailable()
  const tabs = canEdit ? ['wall', 'shops', 'library', 'about'] : ['about']
  const dz = (settings.discogs || {}) as Discogs
  const discogsTrouble = !!dz.hasToken && dz.status === 'error'
  const [copyNote, setCopyNote] = useState('')
  const ask = useRef<HTMLSpanElement>(null)
  const lib = useLibrary()
  const [view, setView] = useState<'main' | 'import'>('main')
  const [tab, setTab] = useState('wall')
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!open) return
    const importing = at === 'import' || lib.active
    setView(importing ? 'import' : 'main')
    setTab(importing || at === 'discogs' ? 'library' : 'wall')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // a change of view puts focus on the new title, except where the step's own button takes it (a plan, a finished import)
  const shown = useRef(view)
  useEffect(() => {
    const was = shown.current
    shown.current = view
    if (!open || view === was || (view === 'import' && (lib.stage === 'plan' || lib.stage === 'done'))) return
    requestAnimationFrame(() => title.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view])
  const back = () => {
    lib.leave()
    setView('main')
  }
  const close = () => {
    if (view === 'import') lib.leave()
    onClose()
  }
  // opening Settings checks for a newer release at most once a day, on the owner's own wall
  useEffect(() => {
    if (open && canEdit && hasMcp && settings.taskId && Date.now() - (settings.update?.checkedMs || 0) > 24 * 3600000) fireTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Drawer side="right" open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full sm:max-w-xl">
        <DrawerHeader>
          {view === 'import' && (
            <Button size="sm" variant="ghost" className="-ms-3 self-start" onClick={back}>
              ‹ Settings
            </Button>
          )}
          <DrawerTitle ref={title} tabIndex={-1} className="outline-none">
            {view === 'import' ? 'Import your library' : 'Settings'}
          </DrawerTitle>
          {view === 'import' && <DrawerDescription>Bring in a file you saved with Export your library.</DrawerDescription>}
        </DrawerHeader>
        <DrawerBody>
          {(error || notice) && (
            <Alert variant={error ? 'error' : 'info'} className="mb-4" dismissible onOpenChange={(o) => !o && clearError()}>
              <AlertTitle>{error || notice}</AlertTitle>
            </Alert>
          )}
          {view === 'import' ? (
            <div className="pb-8">
              <ImportView lib={lib} onDone={close} />
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-8">
              {update && (
                <Alert variant="warning">
                  <AlertTitle>An update is available</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    <span>To install it, start a chat with Claude and send this. Your records, equipment and settings stay as they are.</span>
                    <span ref={ask} className="bg-background-strong block rounded-(--radius-2xs) p-2 font-mono text-xs break-all select-all">
                      {updateAsk(settings)}
                    </span>
                    <span className="flex items-center gap-2">
                      <CopyButton
                        size="sm"
                        variant="outline"
                        value={updateAsk(settings)}
                        copiedLabel="Copied"
                        onCopyError={() => {
                          const sel = getSelection()
                          if (ask.current && sel) {
                            const r = document.createRange()
                            r.selectNodeContents(ask.current)
                            sel.removeAllRanges()
                            sel.addRange(r)
                          }
                          setCopyNote("Selected: copy it with your device's copy command")
                        }}
                      >
                        Copy
                      </CopyButton>
                      {copyNote && <span className="text-xs">{copyNote}</span>}
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              {/* the hidden tabs stay mounted, so an edit typed just before switching still saves */}
              <Tabs className="gap-5" value={tabs.includes(tab) ? tab : tabs[0]} onValueChange={(v) => setTab(String(v))}>
                {tabs.length > 1 && (
                  <TabsList variant="line" size="sm" activateOnFocus>
                    <TabsTrigger value="wall">Wall</TabsTrigger>
                    <TabsTrigger value="shops">Shops</TabsTrigger>
                    <TabsTrigger value="library">
                      Library
                      {discogsTrouble && (
                        <>
                          {' '}
                          <span aria-hidden="true" className="bg-want size-1.75 rounded-full" />
                          <span className="sr-only">(Discogs needs attention)</span>
                        </>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                  </TabsList>
                )}
                {canEdit && (
                  <TabsContent value="wall" keepMounted className="flex flex-col gap-8">
                    <PageSection />
                    <BackgroundSection />
                    <HangingSection />
                  </TabsContent>
                )}
                {canEdit && (
                  <TabsContent value="shops" keepMounted>
                    <ShopsSection />
                  </TabsContent>
                )}
                {canEdit && (
                  <TabsContent value="library" keepMounted className="flex flex-col gap-8">
                    <DiscogsSection focus={at === 'discogs'} />
                    <LibrarySection lib={lib} onImport={() => setView('import')} />
                  </TabsContent>
                )}
                <TabsContent value="about" keepMounted>
                  <Fieldset>
                    <FieldsetLegend>About</FieldsetLegend>
                    <p className="text-foreground-muted text-sm">
                      Found a problem or have an idea?{' '}
                      <a href={REPO_URL + '/issues/new/choose'} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
                        Tell us on GitHub
                      </a>
                      .
                    </p>
                    <p className="text-foreground-muted text-sm">
                      Anyone you share this wall with can see everything on it, prices, orders and notes included. Only you and people you make Editors can
                      change it.
                    </p>
                    <p className="text-foreground-muted font-mono text-xs">Vinyl Wall {APP_VERSION}</p>
                  </Fieldset>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DrawerBody>
      </SheetContent>
    </Drawer>
  )
}
