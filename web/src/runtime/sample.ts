// Sample records for local dev and tests, in production's shapes (a subset of dev/mock.js). Not real data.
import { today } from '../model/record'

const day = (n: number) => {
  const t = new Date(Date.now() - n * 864e5)
  return new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}

export const sample = () => ({
  records: {
    r1: {
      title: 'Kind of Blue', artist: 'Miles Davis', year: '1959', label: 'Columbia', status: 'own', runtime: 46,
      why: 'The record that taught me to sit still and listen.',
      pressing: '2015 Analogue Productions 45rpm 2LP (Discogs r7140383)', discogsId: 7140383, catalog: 'AAPJ 8163-45',
      matrix: 'Side A: AAPJ 8163-45 A · Side B: AAPJ 8163-45 B',
      mediaGrade: 'NM', sleeveGrade: 'VG+', shop: 'A local record shop', paid: '48', acquired: '2024-03-02',
      autoFilled: ['year', 'label'],
      about: {
        summary: 'Kind of Blue is Miles Davis\'s 1959 album with a sextet of John Coltrane, Cannonball Adderley, Bill Evans, Wynton Kelly, Paul Chambers and Jimmy Cobb.',
        released: '1959-08-17', label: 'Columbia', producers: ['Teo Macero', 'Irving Townsend'], genres: ['Modal jazz', 'Cool jazz'],
        tracks: [
          { pos: 'A', title: 'So What', dur: '9:22' }, { pos: 'B1', title: 'Freddie Freeloader', dur: '9:46' },
          { pos: 'B2', title: 'Blue in Green', dur: '5:37' }, { pos: 'C', title: 'All Blues', dur: '11:33' },
          { pos: 'D', title: 'Flamenco Sketches', dur: '9:26' },
        ],
      },
      notes: [
        { d: day(400), t: 'Played the whole album on Den (~46 min)' },
        { d: day(40), t: 'Cleaned it before a spin.' },
        { d: today().slice(0, 8) + '01', t: 'Played one side on Den (~23 min)', side: 'B', j: 'Blue in Green floated tonight.', vibe: 5 },
        { d: today(), t: 'Played the whole album on Living room (~46 min). Side B hit different tonight.' },
      ],
      added: 1,
    },
    r3: { title: 'Blue Train', artist: 'John Coltrane', year: '1957', label: 'Blue Note', status: 'own', runtime: 42, notes: [], added: 3 },
    r5: { title: 'Aja', artist: 'Steely Dan', year: '1977', status: 'ordered', orderStatus: 'shipped', eta: '2026-10-24', shop: 'Rough Trade', notes: [], added: 5 },
    r6: { title: 'Pet Sounds', artist: 'The Beach Boys', year: '1966', status: 'wish', priority: 3, discogsSync: { rid: 123 }, notes: [], added: 6 },
    r7: {
      title: 'Abbey Road', artist: 'The Beatles', year: '1969', status: 'wish', priority: 1, copyName: 'UK first', pressing: 'UK first pressing', budget: '150',
      moreCopies: [{ name: 'Half-speed reissue', pressing: '2019 half-speed', label: 'Apple', catalog: '', budget: '40' }], notes: [], added: 4,
    },
  } as Record<string, Record<string, unknown>>,
})
