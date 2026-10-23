import { useEffect, useState } from 'react'
import { Button } from '@appica/ui-react/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@appica/ui-react/card'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from '@appica/ui-react/drawer'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@appica/ui-react/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@appica/ui-react/select'
import { Textarea } from '@appica/ui-react/textarea'
import { useTheme } from '@appica/ui-react/hooks/use-theme'

// Spike: proves React 19 + appica build into one inlined HTML file and can
// reach the claude.ai runtime. Not the real app.

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<any> }
  }
}

const SAMPLE = [
  { id: '1', title: 'Kind of Blue', artist: 'Miles Davis' },
  { id: '2', title: 'Blue Train', artist: 'John Coltrane' },
  { id: '3', title: 'Rumours', artist: 'Fleetwood Mac' },
  { id: '4', title: 'Remain in Light', artist: 'Talking Heads' },
]

type Probe = 'checking' | 'no runtime' | 'no db' | 'ok' | `error: ${string}`

export function App() {
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState<(typeof SAMPLE)[number] | null>(null)
  const [probe, setProbe] = useState<Probe>('checking')

  useEffect(() => {
    if (!window.claude?.use) return setProbe('no runtime')
    let unsub: (() => void) | undefined
    window.claude
      .use('db')
      .then(async (db) => {
        const ref = db.doc('spike/probe')
        unsub = ref.onSnapshot((snap: any) => {
          if (snap.exists) setProbe('ok')
        })
        await ref.set({ at: new Date().toISOString() })
      })
      .catch((e) => setProbe(e ? `error: ${e.message || e.code}` : 'no db'))
    return () => unsub?.()
  }, [])

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-foreground-intense text-2xl font-semibold">Vinyl Wall spike</h1>
        <Button variant="outline" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
        </Button>
      </header>
      <p className="text-foreground-muted mb-4 text-sm" data-testid="probe">
        Runtime db: {probe}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SAMPLE.map((r) => (
          <button key={r.id} className="text-left" onClick={() => setOpen(r)}>
            <Card>
              <CardHeader>
                <CardTitle>{r.title}</CardTitle>
                <CardDescription>{r.artist}</CardDescription>
              </CardHeader>
            </Card>
          </button>
        ))}
      </div>

      <Drawer side="right" open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{open?.title}</DrawerTitle>
            <DrawerDescription>{open?.artist}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <Tabs defaultValue="notes">
              <TabsList>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="log">Log</TabsTrigger>
              </TabsList>
              <TabsContent value="notes" className="flex flex-col gap-3 pt-3">
                <Select defaultValue="owned">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned</SelectItem>
                    <SelectItem value="wanted">Wanted</SelectItem>
                    <SelectItem value="ordered">Ordered</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Notes" rows={6} />
              </TabsContent>
              <TabsContent value="log" className="pt-3">
                {Array.from({ length: 40 }, (_, i) => (
                  <p key={i} className="text-foreground-muted py-1 text-sm">
                    Played on the Technics, side {i % 2 ? 'B' : 'A'}
                  </p>
                ))}
              </TabsContent>
            </Tabs>
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose render={<Button variant="outline">Close</Button>} />
            <Button>Save</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  )
}
