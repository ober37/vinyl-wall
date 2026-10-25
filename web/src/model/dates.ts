// "YYYY-MM-DD" <-> a local Date at noon, so a timezone never moves the day
export const toDate = (s: string | undefined) => (s && /^\d{4}-\d\d-\d\d$/.test(s) ? new Date(s + 'T12:00') : null)
export const fromDate = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''
