import { useEffect, useState } from 'react'
import type { MinecraftManifest } from '@shared/types'
import type { StartFileInfo } from '@shared/games/minecraft/types'
import { t } from '../../i18n'

/**
 * Archivo de inicio de un servidor a medida (§19.x): con cuál arranca y
 * cambiarlo. Normalmente es run.bat, pero un pack puede traer varios (uno con
 * reinicio automático y otro sin él, o un .jar además del script).
 */

interface Props {
  manifest: MinecraftManifest
  running: boolean
  onChanged: () => void
}

export function StartFileCard({ manifest, running, onChanged }: Props): React.JSX.Element | null {
  const custom = manifest.data.custom
  const [files, setFiles] = useState<StartFileInfo[]>([])
  const [chosen, setChosen] = useState(custom?.startFile ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setChosen(custom?.startFile ?? '')
    void window.qubiq.minecraft.custom
      .startFiles(manifest.id)
      .then(setFiles)
      .catch(() => setFiles([]))
  }, [manifest.id, custom?.startFile])

  if (!custom) return null

  // El elegido puede no estar en la raíz (se eligió a mano): se enseña igual.
  const options = files.some((f) => f.path === custom.startFile)
    ? files
    : [{ path: custom.startFile } as StartFileInfo, ...files]

  async function save(path: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.minecraft.custom.setStartFile(manifest.id, path)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function pick(): Promise<void> {
    setError(null)
    try {
      const picked = await window.qubiq.minecraft.custom.pickStartFile({ instanceId: manifest.id })
      if (picked) await save(picked.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const selected = files.find((f) => f.path === chosen)

  return (
    <div className="card">
      <h3>{t('mc.start.title')}</h3>
      <p className="hint">{t('mc.start.hint')}</p>

      {error && (
        <div className="alert error">
          <strong>{t('mc.start.failed')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="field" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <select
            value={chosen}
            disabled={running || busy}
            onChange={(e) => setChosen(e.target.value)}
            style={{ flex: 1 }}
          >
            {options.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={running || busy || chosen === custom.startFile}
            onClick={() => void save(chosen)}
          >
            {t('mc.start.use')}
          </button>
          <button disabled={running || busy} onClick={() => void pick()}>
            {t('mc.start.other')}
          </button>
        </div>

        <div className="help">
          {running
            ? t('mc.start.stopToChange')
            : selected?.restartLoop
              ? t('mc.start.loopWarning')
              : custom.memory === 'script'
                ? t('mc.start.memoryByFile')
                : custom.memory === 'jvm-args'
                  ? t('mc.start.memoryByArgs')
                  : t('mc.start.memoryByApp')}
        </div>
      </div>
    </div>
  )
}
