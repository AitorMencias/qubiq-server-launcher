import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { detectLanguage, setLanguage, t } from '@shared/i18n'
import { applyDocumentLanguage } from '../i18n'
import { RemoteApp } from './RemoteApp'
import './remote.css'

/**
 * Página remota (§19.31): la que sirve el anfitrión para manejarlo desde el
 * móvil u otro PC. No usa `window.qubiq`: todo va por `api.ts`, firmado.
 */

const language = detectLanguage(navigator.languages)
setLanguage(language)
applyDocumentLanguage(language)
document.title = t('remote.web.title')

const container = document.getElementById('root')
if (!container) throw new Error('#root')

createRoot(container).render(
  <StrictMode>
    <RemoteApp />
  </StrictMode>
)
