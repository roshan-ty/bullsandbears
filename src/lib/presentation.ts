export function formatTime(value: string | null): string {
  if (!value) return 'Not yet published'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Invalid source timestamp'
}

export function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function saveTheme(theme: 'dark' | 'light') {
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Private/restricted browsing must not prevent the dashboard from rendering.
  }
}