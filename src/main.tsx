import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import AppErrorBoundary from './components/AppErrorBoundary.tsx'
import { installConsoleErrorReporting, installGlobalClientErrorReporting } from './lib/clientErrorReporter.ts'
import './index.css'

installGlobalClientErrorReporting()
installConsoleErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
