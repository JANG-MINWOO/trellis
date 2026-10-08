import { createRoot } from 'react-dom/client'
import './i18n'
import './styles/globals.css'
import { App } from './app/App'

// No StrictMode: double-mounted effects would create and dispose live terminals twice.
createRoot(document.getElementById('root')!).render(<App />)
