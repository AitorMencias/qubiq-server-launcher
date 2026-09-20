import { useCallback, useEffect, useState } from 'react'
import type { ConfigChange, ConfigOption, EditableConfig } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import { OptionList, changeOf, sameAsOriginal, type Draft } from './OptionList'

/**
 * Una pestaña que edita uno de los dos ficheros de configuración de Zomboid.
 *
 * Los dos se comportan igual —se cargan, se tocan unas cuantas opciones y se
 * guardan todas de golpe—, y lo que cambia entre ellos es de dónde salen, qué
 * hace falta para poder guardarlos y qué hay que explicarle al usuario. Eso
 * llega por parámetros en vez de estar duplicado dos veces.
 */

interface Props {
  /** Para volver a cargar cuando cambia de servidor. */
  instanceId: string
  load: () => Promise<EditableConfig>
  save: (changes: ConfigChange[]) => Promise<EditableConfig>
  /** Una o dos frases sobre qué es este fichero y cuándo se aplica. */
  intro: React.ReactNode
  /** Por qué no se puede guardar ahora mismo, si es el caso. */
  blocked?: React.ReactNode
  /** Lo que se dice al guardar bien. */
  savedNotice: string
  /** Botones propios de la pestaña (restablecer la dificultad, por ejemplo). */
  extra?: React.ReactNode
}

export function ConfigTab({
  instanceId,
  load,
  save,
  intro,
  blocked,
  savedNotice,
  extra
}: Props): React.JSX.Element {
  const [config, setConfig] = useState<EditableConfig | null>(null)
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      setConfig(await load())
      setDrafts(new Map())
    } catch (err) {
      setConfig(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload, instanceId])

  function change(option: ConfigOption, value: Draft): void {
    setNotice(null)
    setDrafts((prev) => {
      const next = new Map(prev)
      // Volver al valor de partida no es un cambio: se quita del borrador para
      // que el contador y el botón de guardar digan la verdad.
      if (sameAsOriginal(option, value)) next.delete(pathKey(option.path))
      else next.set(pathKey(option.path), value)
      return next
    })
  }

  async function guardar(): Promise<void> {
    if (!config) return
    setBusy(true)
    setError(null)
    try {
      const changes = config.options
        .filter((option) => drafts.has(pathKey(option.path)))
        .map((option) => changeOf(option, drafts.get(pathKey(option.path))!))
      setConfig(await save(changes))
      setDrafts(new Map())
      setNotice(savedNotice)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const cambios = drafts.size

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}
      {blocked && <div className="alert info">{blocked}</div>}

      <p className="cfg-origin">{intro}</p>

      {config && (
        <>
          {/* Buscar no se hace aquí: la barra de arriba busca en esta pestaña
              y en la otra a la vez, que es lo que hace falta cuando hay 414
              ajustes repartidos entre las dos. */}
          <p className="cfg-count">
            {config.options.length} opciones
            {cambios > 0 ? ` · ${cambios} cambiada${cambios === 1 ? '' : 's'}` : ''}
          </p>

          <div className="row cfg-actions">
            <button
              className="primary"
              disabled={busy || cambios === 0 || blocked !== undefined}
              onClick={() => void guardar()}
            >
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {cambios > 0 && (
              <button disabled={busy} onClick={() => setDrafts(new Map())}>
                Descartar
              </button>
            )}
            {extra}
          </div>

          <OptionList
            config={config}
            drafts={drafts}
            disabled={busy || blocked !== undefined}
            onChange={change}
          />
        </>
      )}
    </div>
  )
}
