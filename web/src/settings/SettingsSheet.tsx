import { useEffect, useRef, useState } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@appica/ui-react/alert'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import { CopyButton } from '@appica/ui-react/copy-button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody } from '@appica/ui-react/drawer'
import { Field, FieldLabel, FieldDescription } from '@appica/ui-react/field'
import { Fieldset, FieldsetLegend } from '@appica/ui-react/fieldset'
import { Input } from '@appica/ui-react/input'
import { today } from '../model/record'
import { newer, updateAsk } from '../model/task'
import { useRuntime } from '../runtime/runtime'
import { Confirm } from '../sheet/Confirm'
import { APP_VERSION } from '../version'

// an update is offered only on the owner's own wall with background updates set up (production's updateState)
export function useUpdateAvailable() {
  const { canEdit, hasMcp, settings } = useRuntime()
  return canEdit && hasMcp && !!settings.taskId && newer(settings.update?.latest, APP_VERSION)
}

type Discogs = { username?: string; hasToken?: boolean; last4?: string; status?: string; msg?: string; verifiedUser?: string; savedAt?: string; checkedAt?: string }

function DiscogsSection() {
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
      saveSettings({ discogs: { ...dz, username: u.trim(), ...(dz.hasToken ? { status: 'pending' } : {}) } })
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
      fireTask()
    } catch (e) {
      setStatus("Couldn't save the token: " + ((e as { message?: string }).message || String(e)))
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
      <FieldsetLegend>Discogs</FieldsetLegend>
      <p className="text-foreground-muted text-sm">Connect your Discogs account to keep your collection and wantlist in sync with the wall.</p>
      <Field>
        <FieldLabel>Username</FieldLabel>
        <Input value={user} onChange={(e) => typeUser(e.target.value)} autoComplete="off" autoCapitalize="off" />
      </Field>
      {dz.hasToken && (
        <div className="bg-wall flex flex-wrap items-center gap-2.5 rounded-(--radius-xs) p-3">
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
            Saved {dz.savedAt}
            {dz.checkedAt ? ' · checked ' + dz.checkedAt : ''}
          </span>
        </div>
      )}
      {dz.hasToken && dz.status === 'error' && dz.msg && <p className="text-error-emphasis text-sm">{dz.msg}</p>}
      {dz.hasToken && !replacing ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReplacing(true)}>
            Replace token
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveSettings({ discogs: { ...dz, status: 'pending' } }).then(() => fireTask())}
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
          <div className="flex flex-wrap gap-2">
            <Input
              type={show ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste your token"
              className="min-w-0 flex-1 font-mono"
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
    </Fieldset>
  )
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, canEdit, hasMcp, fireTask, error, notice, clearError } = useRuntime()
  const update = useUpdateAvailable()
  const [copyNote, setCopyNote] = useState('')
  const ask = useRef<HTMLSpanElement>(null)

  // opening Settings checks for a newer release at most once a day, on the owner's own wall
  useEffect(() => {
    if (open && canEdit && hasMcp && settings.taskId && Date.now() - (settings.update?.checkedMs || 0) > 24 * 3600000) fireTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Drawer side="right" open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="w-full sm:max-w-xl">
        <DrawerHeader>
          <DrawerTitle>Settings</DrawerTitle>
          <DrawerDescription>Your Discogs connection and updates</DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-8 *:shrink-0">
          {(error || notice) && (
            <Alert variant={error ? 'error' : 'info'} dismissible onOpenChange={(o) => !o && clearError()}>
              <AlertTitle>{error || notice}</AlertTitle>
            </Alert>
          )}
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
          {canEdit && <DiscogsSection />}
          <Fieldset>
            <FieldsetLegend>Help</FieldsetLegend>
            <p className="text-foreground-muted font-mono text-xs">Vinyl Wall {APP_VERSION}</p>
          </Fieldset>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
