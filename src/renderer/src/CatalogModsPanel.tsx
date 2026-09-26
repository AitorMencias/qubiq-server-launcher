import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { InstanceState } from '@shared/types'
import {
  modSizeLabel,
  type ModCatalogItem,
  type ModInstallResult,
  type ModsView
} from '@shared/games/mods'

/**
 * Pestaña de mods de los juegos que tienen **cargador y catálogo con buscador**:
 * Satisfactory (ficsit.app, con SML), Valheim (Thunderstore, con BepInEx) y
 * Rust (uMod, con Oxide).
 *
 * Es común a los tres porque la pantalla es la misma pregunta: qué hay puesto,
 * qué falta para que funcione y qué más se puede poner. Lo que cambia —cómo se
 * llama el catálogo, qué necesitan los jugadores, qué se busca, si se puede
 * tocar en caliente— entra por parámetros. Project Zomboid y Factorio tienen la
 * suya: uno va por enlaces del taller de Steam y el otro pide cuenta para
 * descargar, y forzarlos a esta pantalla habría sido peor para todos.
 *
 * Tres cosas que esta pantalla no esconde:
 *
 * 1. **Sin el cargador no hay mods.** Se instala solo con el primero, y se dice.
 * 2. **Cambiar mods exige el servidor parado**, salvo en el juego cuyo cargador
 *    los carga en caliente (Oxide): ahí lo único que exige pararlo es poner o
 *    quitar el propio cargador.
 * 3. **Lo que necesitan los jugadores**: en Satisfactory y Valheim, lo mismo
 *    que el servidor; en Rust, nada, porque los plugins solo corren en él.
 */

export interface ModsApi {
  search(id: string, text: string): Promise<ModCatalogItem[]>
  list(id: string): Promise<ModsView>
  add(id: string, modId: string): Promise<ModInstallResult>
  remove(id: string, modId: string): Promise<ModsView>
  setEnabled(id: string, modId: string, enabled: boolean): Promise<ModsView>
  updates(id: string): Promise<Record<string, string>>
  update(id: string, modId: string): Promise<ModsView>
  removeLoader(id: string): Promise<ModsView>
}

interface Props {
  state: InstanceState
  onChanged: () => void
  api: ModsApi
  /** El identificador del cargador dentro del catálogo, para poder actualizarlo. */
  loaderId: string
  /** Cómo se llama el catálogo y dónde vive, para poder nombrarlo. */
  catalog: { name: string; url: string }
  /** Qué tienen que hacer los jugadores para poder entrar. */
  playersNote: ReactNode
  /** El titular de esa nota. De serie, que necesitan los mismos mods. */
  playersTitle?: string
  /** Ejemplos de lo que se puede buscar, que es lo que arranca al que no sabe. */
  searchPlaceholder: string
  /** Cómo se llaman en este juego: «mod» o «plugin». */
  noun?: { one: string; many: string }
  /**
   * El cargador los carga y descarga en caliente (Oxide), así que añadir,
   * quitar o apagar vale con el servidor en marcha. Poner o quitar el propio
   * cargador sigue exigiendo pararlo.
   */
  liveChanges?: boolean
  /** Algo más que enseñar debajo de lo instalado (abrir la carpeta…). */
  extra?: ReactNode
  /** El botón de lo que no se puede instalar. De serie, «Solo cliente». */
  unavailableLabel?: string
}

export function CatalogModsPanel({
  state,
  onChanged,
  api,
  loaderId,
  catalog,
  playersNote,
  playersTitle = 'Los jugadores necesitan los mismos mods',
  searchPlaceholder,
  noun = { one: 'mod', many: 'mods' },
  liveChanges = false,
  extra,
  unavailableLabel = 'Solo cliente'
}: Props): React.JSX.Element {
  const id = state.manifest.id
  const stopped = state.status === 'stopped' || state.status === 'crashed'
  // Lo que se puede tocar ahora: los mods, si el cargador los carga en
  // caliente; el cargador en sí, solo parado.
  const parado = stopped || (liveChanges && state.status === 'running')

  const [view, setView] = useState<ModsView | null>(null)
  const [updates, setUpdates] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModCatalogItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setView(await api.list(id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, id])

  useEffect(() => {
    void reload()
  }, [reload])

  async function run(accion: string, fn: () => Promise<unknown>, hecho?: string): Promise<void> {
    setBusy(accion)
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (hecho) setNotice(hecho)
      await reload()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function search(): Promise<void> {
    setSearching(true)
    setError(null)
    try {
      setResults(await api.search(id, query.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  async function install(mod: ModCatalogItem): Promise<void> {
    setBusy(mod.id)
    setError(null)
    setNotice(null)
    try {
      const result = await api.add(id, mod.id)
      setView(result.view)
      setNotice(
        result.dependencies.length === 0
          ? `«${mod.name}» instalado.`
          : `«${mod.name}» instalado, y con él ${listar(result.dependencies)}, que lo ${
              result.dependencies.length === 1 ? 'necesitaba' : 'necesitaban'
            }.`
      )
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function lookForUpdates(): Promise<void> {
    setBusy('updates')
    setError(null)
    try {
      const nuevas = await api.updates(id)
      setUpdates(nuevas)
      const cuantas = Object.keys(nuevas).length
      setNotice(
        cuantas === 0
          ? 'Todo está al día.'
          : `${cuantas} con versión nueva. Actualizar es cosa tuya: un ${noun.one} nuevo puede cambiar la partida.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const instalados = new Set(view?.mods.map((mod) => mod.id) ?? [])
  const cargador = view?.loader

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {!parado && (
        <div className="alert info">
          <strong>Con el servidor arrancado solo se puede mirar</strong>
          <p>
            Los {noun.many} se cargan al arrancar y no se vuelven a mirar. Para añadir, quitar o
            apagar alguno, para antes el servidor.
          </p>
        </div>
      )}

      {liveChanges && !stopped && (
        <div className="alert info">
          <strong>Se puede cambiar con el servidor en marcha</strong>
          <p>
            {cargador?.name ?? 'El cargador'} carga y descarga los {noun.many} al momento: añadir,
            apagar o quitar uno vale sin reiniciar. Lo que sí exige parar el servidor es poner o
            quitar {cargador?.name ?? 'el cargador'}.
          </p>
        </div>
      )}

      <div className="alert info">
        <strong>{playersTitle}</strong>
        <p>{playersNote}</p>
      </div>

      {/* --- El cargador ------------------------------------------------- */}

      <div className="card">
        <h3>Cargador de {noun.many}</h3>
        {cargador?.problem && (
          <div className="alert warn" style={{ marginBottom: 12 }}>
            <strong>{cargador.name} no está funcionando ahora mismo</strong>
            <p>{cargador.problem}</p>
          </div>
        )}
        {cargador?.installed || (cargador?.problem && cargador.version) ? (
          <div className="row between">
            <span>
              <strong>{cargador.name}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {cargador.version ? `Versión ${cargador.version}. ` : ''}
                Es lo que hace que el servidor cargue los {noun.many}.
              </p>
              {/* Lo que pasó de verdad la última vez. Solo lo cuenta el juego
                  cuyo cargador no lo dice por la consola (Valheim). */}
              {cargador.lastRun && (
                <p className="hint" style={{ margin: 0 }}>
                  {cargador.lastRun.loaded.length > 0
                    ? `En el último arranque cargó ${cargador.lastRun.loaded.length}: ${cargador.lastRun.loaded.join(', ')}.`
                    : `En el último arranque no cargó ningún ${noun.one}.`}
                </p>
              )}
            </span>
            <span className="row" style={{ flexShrink: 0 }}>
              {updates[loaderId] && (
                <button
                  className="primary"
                  disabled={!stopped || busy !== null}
                  title={stopped ? undefined : `Para el servidor para cambiar ${cargador.name}`}
                  onClick={() =>
                    void run(
                      loaderId,
                      () => api.update(id, loaderId),
                      `${cargador.name} actualizado.`
                    )
                  }
                >
                  Actualizar a {updates[loaderId]}
                </button>
              )}
              {(view?.mods.length ?? 0) === 0 && (
                <button
                  className="danger"
                  disabled={!stopped || busy !== null}
                  title={stopped ? undefined : `Para el servidor para quitar ${cargador.name}`}
                  onClick={() =>
                    void run(
                      'loader',
                      () => api.removeLoader(id),
                      `Servidor sin ${noun.many}, como vino de Steam.`
                    )
                  }
                >
                  Quitar
                </button>
              )}
            </span>
          </div>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            Todavía no está puesto. Se instala solo con el primer {noun.one} que añadas: sin él, el
            servidor no miraría siquiera la carpeta de {noun.many}.
            {liveChanges && !stopped && ' Para ponerlo hay que parar el servidor.'}
          </p>
        )}

        {cargador?.lastRun && cargador.lastRun.problems.length > 0 && (
          <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>El cargador se quejó en el último arranque</strong>
            {cargador.lastRun.problems.map((problema) => (
              <p key={problema}>{problema}</p>
            ))}
          </div>
        )}
      </div>

      {/* --- Lo instalado ------------------------------------------------ */}

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Instalados</h3>
          <button disabled={busy !== null} onClick={() => void lookForUpdates()}>
            {busy === 'updates' ? 'Mirando…' : 'Buscar actualizaciones'}
          </button>
        </div>

        {view === null ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Leyendo lo que hay…
          </p>
        ) : view.mods.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Ninguno. El servidor va con el juego tal cual.
          </p>
        ) : (
          view.mods.map((mod) => (
            <div className="row between" key={mod.id} style={{ marginTop: 12 }}>
              <label className="row" style={{ cursor: parado ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  disabled={!parado || busy !== null}
                  onChange={(e) =>
                    void run(mod.id, () => api.setEnabled(id, mod.id, e.target.checked))
                  }
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  <strong>{mod.name}</strong>
                  <div className="help" style={{ margin: 0 }}>
                    Versión {mod.version} · {modSizeLabel(mod.sizeBytes)}
                    {mod.enabled ? '' : ' · apagado'}
                    {mod.dependency && ` · lo necesita otro ${noun.one}`}
                  </div>
                  {mod.problem && (
                    <div className="help" style={{ margin: 0 }}>
                      <strong>{mod.problem}</strong>
                    </div>
                  )}
                </span>
              </label>
              <span className="row" style={{ flexShrink: 0 }}>
                {updates[mod.id] && (
                  <button
                    className="primary"
                    disabled={!parado || busy !== null}
                    onClick={() =>
                      void run(
                        mod.id,
                        () => api.update(id, mod.id),
                        `«${mod.name}» actualizado. Se ha guardado una copia antes.`
                      )
                    }
                  >
                    Actualizar a {updates[mod.id]}
                  </button>
                )}
                <button
                  className="danger"
                  disabled={!parado || busy !== null}
                  onClick={() =>
                    void run(mod.id, () => api.remove(id, mod.id), `«${mod.name}» quitado.`)
                  }
                >
                  Quitar
                </button>
              </span>
            </div>
          ))
        )}
        {extra}
      </div>

      {/* --- El catálogo -------------------------------------------------- */}

      <div className="card">
        <h3>Añadir de {catalog.name}</h3>
        <p className="hint">
          Busca por nombre o por lo que hace. Con la caja vacía salen los más usados. Lo que
          necesite un {noun.one} para funcionar se instala con él.
        </p>

        <div className="row" style={{ marginBottom: 14 }}>
          <input
            className="grow"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
          />
          <button style={{ flexShrink: 0 }} disabled={searching} onClick={() => void search()}>
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {results?.length === 0 && (
          <p className="hint">No hay ningún {noun.one} que se llame así ni que hable de eso.</p>
        )}

        {results?.map((mod) => (
          <div className="row between" key={mod.id} style={{ marginBottom: 12 }}>
            <div>
              <strong>{mod.name}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {mod.summary}
                <br />
                de {mod.author} · {mod.downloads.toLocaleString('es-ES')} descargas
                {mod.version && ` · versión ${mod.version}`}
              </p>
              {/* .help solo tiene estilo dentro de un .field o de una casilla;
                  suelta en una tarjeta saldría a tamaño normal (README). */}
              {!mod.forServer && (
                <p className="hint" style={{ margin: 0 }}>
                  {mod.clientOnlyReason}
                </p>
              )}
            </div>
            <button
              style={{ flexShrink: 0 }}
              disabled={
                !parado ||
                // El primero trae el cargador, y el cargador solo se pone parado.
                (!stopped && !cargador?.installed) ||
                busy !== null ||
                instalados.has(mod.id) ||
                !mod.forServer
              }
              title={
                parado && (stopped || cargador?.installed)
                  ? undefined
                  : `Para el servidor para poder instalar ${noun.many}`
              }
              onClick={() => void install(mod)}
            >
              {instalados.has(mod.id)
                ? 'Instalado'
                : busy === mod.id
                  ? 'Instalando…'
                  : !mod.forServer
                    ? unavailableLabel
                    : 'Instalar'}
            </button>
          </div>
        ))}

        <p className="help" style={{ marginBottom: 0 }}>
          Los {noun.many} los hace gente de la comunidad y se descargan de {catalog.name} (
          {catalog.url}). Ni el estudio del juego ni esta aplicación responden de lo que hagan.
        </p>
      </div>
    </div>
  )
}

/** «A», «A y B», «A, B y C»: para poder decir qué se ha instalado de paso. */
function listar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
