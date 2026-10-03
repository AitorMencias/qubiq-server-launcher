import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { detectLanguage, setLanguage } from '@shared/i18n'
import type { BootInfo } from '@shared/dataFolder'
import { App } from './App'
import { RelocationScreen } from './RelocationScreen'
import { applyDocumentLanguage } from './i18n'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('#root')

/**
 * Antes de pintar nada: el idioma (para no enseñar un instante la app en otro)
 * y si se están moviendo los datos, que es lo único que se enseña entonces.
 */
async function boot(): Promise<void> {
  const info: BootInfo | null = await window.qubiq.app.boot().catch(() => null)
  const systemLanguage = info?.systemLanguage ?? detectLanguage(navigator.languages)
  const language = info?.language ?? systemLanguage
  setLanguage(language)
  applyDocumentLanguage(language)

  const relocation = info?.relocation ?? { state: 'idle' }

  createRoot(container!).render(
    <StrictMode>
      {relocation.state === 'idle' ? (
        <App initialLanguage={language} systemLanguage={systemLanguage} />
      ) : (
        <RelocationScreen initial={relocation} />
      )}
    </StrictMode>
  )
}

void boot()
