// a record's facts as label/value rows
// labelCol: one label width for lists that sit one above another, so their values start on the same edge
export function Facts({ rows, labelCol }: { rows: [string, React.ReactNode][]; labelCol?: boolean }) {
  return (
    <dl className={`grid ${labelCol ? 'grid-cols-[5.5rem_1fr]' : 'grid-cols-[auto_1fr]'} gap-x-4 gap-y-2 text-sm`}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-foreground-muted">{k}</dt>
          <dd className="text-foreground min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
