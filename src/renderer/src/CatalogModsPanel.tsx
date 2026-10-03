import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { InstanceState } from '@shared/types'
import {
  modSizeLabel,
  type ModCatalogItem,
  type ModInstallResult,
  type ModsView
} from '@shared/games/mods'
import { formatList, quote, t } from './i18n'

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
  /**
   * Cómo se llaman en este juego: mods o plugins. Cada frase que los nombra
   * tiene su variante en los diccionarios (`….mod` / `….plugin`), porque el
   * sustantivo metido a pelo no concuerda en otros idiomas.
   */
  kind?: 'mod' | 'plugin'
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
  playersTitle = t('catalog.playersSame'),
  searchPlaceholder,
  kind = 'mod',
  liveChanges = false,
  extra,
  unavailableLabel = t('catalog.clientOnly')
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
          ? t('catalog.installedNotice', { name: quote(mod.name) })
          : t('catalog.installedWithDeps', {
              name: quote(mod.name),
              deps: formatList(result.dependencies),
              count: result.dependencies.length
            })
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
        cuantas === 0 ? t('catalog.allUpToDate') : t(`catalog.updatesFound.${kind}`, { count: cuantas })
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
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {!parado && (
        <div className="alert info">
          <strong>{t('catalog.lookOnly')}</strong>
          <p>{t(`catalog.lookOnlyText.${kind}`)}</p>
        </div>
      )}

      {liveChanges && !stopped && (
        <div className="alert info">
          <strong>{t('catalog.liveTitle')}</strong>
          <p>
            {t(`catalog.liveText.${kind}`, {
              loader: cargador?.name ?? t('catalog.loaderGeneric')
            })}
          </p>
        </div>
      )}

      <div className="alert info">
        <strong>{playersTitle}</strong>
        <p>{playersNote}</p>
      </div>

      {/* --- El cargador ------------------------------------------------- */}

      <div className="card">
        <h3>{t(`catalog.loaderTitle.${kind}`)}</h3>
        {cargador?.problem && (
          <div className="alert warn" style={{ marginBottom: 12 }}>
            <strong>{t('catalog.loaderProblem', { name: cargador.name })}</strong>
            <p>{cargador.problem}</p>
          </div>
        )}
        {cargador?.installed || (cargador?.problem && cargador.version) ? (
          <div className="row between">
            <span>
              <strong>{cargador.name}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {cargador.version ? `${t('catalog.version', { version: cargador.version })}. ` : ''}
                {t(`catalog.loaderWhat.${kind}`)}
              </p>
              {/* Lo que pasó de verdad la última vez. Solo lo cuenta el juego
                  cuyo cargador no lo dice por la consola (Valheim). */}
              {cargador.lastRun && (
                <p className="hint" style={{ margin: 0 }}>
                  {cargador.lastRun.loaded.length > 0
                    ? t('catalog.lastRunLoaded', {
                        count: cargador.lastRun.loaded.length,
                        list: cargador.lastRun.loaded.join(', ')
                      })
                    : t(`catalog.lastRunNone.${kind}`)}
                </p>
              )}
            </span>
            <span className="row" style={{ flexShrink: 0 }}>
              {updates[loaderId] && (
                <button
                  className="primary"
                  disabled={!stopped || busy !== null}
                  title={
                    stopped ? undefined : t('catalog.stopToChange', { name: cargador.name })
                  }
                  onClick={() =>
                    void run(
                      loaderId,
                      () => api.update(id, loaderId),
                      t('catalog.loaderUpdated', { name: cargador.name })
                    )
                  }
                >
                  {t('catalog.updateTo', { version: updates[loaderId] })}
                </button>
              )}
              {(view?.mods.length ?? 0) === 0 && (
                <button
                  className="danger"
                  disabled={!stopped || busy !== null}
                  title={
                    stopped ? undefined : t('catalog.stopToRemove', { name: cargador.name })
                  }
                  onClick={() =>
                    void run('loader', () => api.removeLoader(id), t(`catalog.noMods.${kind}`))
                  }
                >
                  {t('catalog.remove')}
                </button>
              )}
            </span>
          </div>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t(`catalog.loaderMissing.${kind}`)}
            {liveChanges && !stopped && ` ${t('catalog.loaderMissingStop')}`}
          </p>
        )}

        {cargador?.lastRun && cargador.lastRun.problems.length > 0 && (
          <div className="alert error" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>{t('catalog.loaderComplained')}</strong>
            {cargador.lastRun.problems.map((problema) => (
              <p key={problema}>{problema}</p>
            ))}
          </div>
        )}
      </div>

      {/* --- Lo instalado ------------------------------------------------ */}

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>{t('catalog.installedTitle')}</h3>
          <button disabled={busy !== null} onClick={() => void lookForUpdates()}>
            {busy === 'updates' ? t('catalog.looking') : t('catalog.lookUpdates')}
          </button>
        </div>

        {view === null ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t('catalog.reading')}
          </p>
        ) : view.mods.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t('catalog.none')}
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
                    {t('catalog.version', { version: mod.version })} · {modSizeLabel(mod.sizeBytes)}
                    {mod.enabled ? '' : ` · ${t('catalog.off')}`}
                    {mod.dependency && ` · ${t(`catalog.neededBy.${kind}`)}`}
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
                        t('catalog.modUpdated', { name: quote(mod.name) })
                      )
                    }
                  >
                    {t('catalog.updateTo', { version: updates[mod.id]! })}
                  </button>
                )}
                <button
                  className="danger"
                  disabled={!parado || busy !== null}
                  onClick={() =>
                    void run(
                      mod.id,
                      () => api.remove(id, mod.id),
                      t('catalog.modRemoved', { name: quote(mod.name) })
                    )
                  }
                >
                  {t('catalog.remove')}
                </button>
              </span>
            </div>
          ))
        )}
        {extra}
      </div>

      {/* --- El catálogo -------------------------------------------------- */}

      <div className="card">
        <h3>{t('catalog.addFrom', { catalog: catalog.name })}</h3>
        <p className="hint">{t(`catalog.searchHint.${kind}`)}</p>

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
            {searching ? t('catalog.searching') : t('catalog.search')}
          </button>
        </div>

        {results?.length === 0 && (
          <p className="hint">{t(`catalog.noResults.${kind}`)}</p>
        )}

        {results?.map((mod) => (
          <div className="row between" key={mod.id} style={{ marginBottom: 12 }}>
            <div>
              <strong>{mod.name}</strong>
              <p className="hint" style={{ margin: 0 }}>
                {mod.summary}
                <br />
                {t('catalog.byAuthor', { author: mod.author, count: mod.downloads })}
                {mod.version && ` · ${t('catalog.versionShort', { version: mod.version })}`}
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
                  : t(`catalog.stopToInstall.${kind}`)
              }
              onClick={() => void install(mod)}
            >
              {instalados.has(mod.id)
                ? t('catalog.installed')
                : busy === mod.id
                  ? t('catalog.installing')
                  : !mod.forServer
                    ? unavailableLabel
                    : t('catalog.install')}
            </button>
          </div>
        ))}

        <p className="help" style={{ marginBottom: 0 }}>
          {t(`catalog.community.${kind}`, { catalog: catalog.name, url: catalog.url })}
        </p>
      </div>
    </div>
  )
}

