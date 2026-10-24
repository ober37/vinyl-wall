// a record's facts as label/value rows
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-foreground-muted">{k}</dt>
          <dd className="text-foreground min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
