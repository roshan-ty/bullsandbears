import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import '@fontsource-variable/inter/wght.css'
import './styles.css'
import './styles/workspace.css'
import './styles/journal.css'
import './styles/yard.css'
import './styles/web.css'
import { productName } from './brand'

document.title = productName

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
