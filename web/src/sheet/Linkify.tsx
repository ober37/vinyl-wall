// Note text with its http(s) addresses as links, as production's linkify: trailing punctuation stays outside the link
// (a closing bracket only when the address has no opening one), and a long address shows as its host plus a short path.
const shortUrl = (u: string) => {
  try {
    const x = new URL(u)
    const rest = x.pathname.replace(/\/$/, '') + x.search
    const seg = x.pathname.split('/')[1]
    return x.host.replace(/^www\./, '') + (rest.length > 24 ? '/' + (seg && seg.length <= 24 ? seg + '/…' : '…') : rest)
  } catch {
    return u
  }
}
const count = (t: string, c: string) => t.split(c).length - 1

export function Linkify({ text }: { text: string }) {
  return String(text ?? '')
    .split(/(https?:\/\/[^\s<>"']+)/i)
    .map((p, i) => {
      if (!(i % 2)) return p
      let u = p
      let tail = ''
      while (/[.,;:!?)\]]$/.test(u)) {
        const c = u.slice(-1)
        if ((c === ')' && count(u, ')') <= count(u, '(')) || (c === ']' && count(u, ']') <= count(u, '['))) break
        tail = c + tail
        u = u.slice(0, -1)
      }
      return (
        <span key={i}>
          <a href={u} title={u} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
            {shortUrl(u)}
          </a>
          {tail}
        </span>
      )
    })
}
