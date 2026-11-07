import { useEffect, useState } from 'react'

export function useChartTheme() {
  const read = () => {
    const light = document.documentElement.dataset.theme === 'light'
    return { background: light ? '#ffffff' : '#0b0e13', grid: light ? '#e9edf3' : '#1d2430', text: light ? '#536174' : '#8f9db2',
      institutional: light ? '#374151' : '#e8edf5', retail: light ? '#326ac5' : '#6ba5ff', up: light ? '#15866e' : '#28b89b', down: light ? '#ca5065' : '#e77586' }
  }
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}
