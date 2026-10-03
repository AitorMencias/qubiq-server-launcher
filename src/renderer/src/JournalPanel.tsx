import { useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import { capabilitiesFor } from '@shared/games'
import { JOURNAL_PAGE, type JournalEntry } from '@shared/journal'
import { uiFor } from './games'
import { JournalList } from './JournalList'

/**
 * Historial del servidor: quién entró y salió, cuándo guardó, a quién se
 * moderó y qué se escribió en la consola.
 *
 * Lo apunta el núcleo (`core/journal`) y queda en disco, así que esto se ve
 * aunque la app se haya cerrado entretanto. Lo que llega mientras la pestaña
 * está abierta se añade arriba sin volver a pedir nada. Cómo se pinta está en
 * `JournalList`, que comparte con la página remota.
 */

interface Props {
  state: InstanceState
}

export function JournalPanel({ state }: Props): React.JSX.Element {
  const { manifest } = state
  const id = manifest.id
  const capabilities = capabilitiesFor(manifest)
  const gameUi = uiFor(manifest)
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setEntries(null)
    setError(null)
    // Lo que llegue mientras se lee el fichero se guarda aparte y se junta
    // después: si no, una entrada nueva podría perderse o salir dos veces.
    const early: JournalEntry[] = []
    let loaded = false

    const off = window.qubiq.on.journal((instanceId, entry) => {
      if (instanceId !== id) return
      if (!loaded) {
        early.push(entry)
        return
      }
      setEntries((current) => [entry, ...(current ?? [])].slice(0, JOURNAL_PAGE))
    })

    window.qubiq.server
      .journal(id)
      .then((list) => {
        if (!alive) return
        loaded = true
        const known = new Set(list.map(entryKey))
        const fresh = early.filter((entry) => !known.has(entryKey(entry))).reverse()
        setEntries([...fresh, ...list].slice(0, JOURNAL_PAGE))
      })
      .catch((err: unknown) => {
        if (!alive) return
        loaded = true
        setEntries([])
        setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      alive = false
      off()
    }
  }, [id])

  return (
    <div className="panel">
      <JournalList
        entries={entries}
        error={error}
        commands={capabilities.commands}
        moderation={capabilities.moderation}
        playerLabel={gameUi.playerLabel}
        limit={JOURNAL_PAGE}
      />
    </div>
  )
}

/** Para no repetir una entrada que llegó por evento mientras se leía el fichero. */
function entryKey(entry: JournalEntry): string {
  return JSON.stringify(entry)
}
