import { useCallback, useEffect, useState } from 'react'
import type { ConfigOption, EditableConfig } from '@shared/editableConfig'
import { pathKey } from '@shared/editableConfig'
import type { GameConfigSearchProps } from '../types'
import { OptionList, changeOf, sameAsOriginal, type Draft } from './OptionList'
import { t } from '../../i18n'

/**
 * Buscador de ajustes de Project Zomboid, encima de las pestañas.
 *
 * Zomboid reparte más de cuatrocientas opciones entre dos ficheros —las reglas
 * de la partida y los ajustes del servidor—, y quien busca «saqueo» o «agua» no
 * tiene por qué saber en cuál de los dos vive lo que quiere. Esto busca en los
 * dos a la vez y deja cambiarlos sin salir de aquí, agrupados por de dónde
 * salen y diciendo en qué pestaña viven, para saber volver.
 *
 * Los dos ficheros no se guardan igual, y eso no se esconde: los ajustes del
 * servidor se pueden cambiar en caliente, y las reglas de la partida solo con
 * el servidor parado (el juego las lee al cargar el mundo y no las vuelve a
 * mirar). Con el servidor en marcha, las reglas salen en los resultados pero no
 * se dejan tocar, y se explica por qué.
 */

/** De cuál de los dos ficheros sale cada resultado. */
interface Origen {
  id: 'partida' | 'servidor'
  /** Qué es esto, dicho sin nombrar pestañas. */
  title: string
  /** Y dónde vive, que depende del modo: en básico no están todas. */
  help: string
  load: () => Promise<EditableConfig>
  save: (changes: ReturnType<typeof changeOf>[]) => Promise<EditableConfig>
  /** Por qué no se puede guardar ahora mismo, si es el caso. */
  blocked?: string
}

export function ZomboidConfigSearch({
  state,
  mode,
  onRefresh,
  onSearching
}: GameConfigSearchProps): React.JSX.Element {
  const id = state.manifest.id
  const running = state.status !== 'stopped' && state.status !== 'crashed'
  const advanced = mode === 'advanced'

  const [query, setQuery] = useState('')
  const [configs, setConfigs] = useState<Record<string, EditableConfig> | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Map<string, Draft>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const origenes: Origen[] = [
    {
      id: 'partida',
      title: t('pz.search.rules'),
      help: t('pz.search.rulesHelp', { tab: t('pz.tab.game') }),
      load: () => window.qubiq.zomboid.sandbox.get(id),
      save: (changes) => window.qubiq.zomboid.sandbox.set(id, changes),
      ...(running
        ? {
            blocked: t('pz.search.rulesBlocked')
          }
        : {})
    },
    {
      id: 'servidor',
      title: t('mc.config.title'),
      // En básico no hay pestaña para estos: se llega a ellos buscando, que es
      // justo lo que el usuario está haciendo. Decirle que vaya a una pestaña
      // que no ve sería mandarlo a ningún sitio.
      help: advanced
        ? t('pz.search.serverHelp', { tab: t('pz.tab.allSettings') })
        : t('pz.search.serverHelpBasic'),
      load: () => window.qubiq.zomboid.settings.get(id),
      save: (changes) => window.qubiq.zomboid.settings.set(id, changes)
    }
  ]

  const buscando = query.trim().length > 0

  // La pantalla de Configuración tapa la pestaña mientras haya resultados.
  useEffect(() => {
    onSearching(buscando)
    return () => onSearching(false)
  }, [buscando, onSearching])

  // Los ficheros se leen la primera vez que se busca algo, no al abrir
  // Configuración: quien solo va a mirar una pestaña no tiene por qué esperar a
  // que se lean y se analicen 65 KB de configuración.
  const cargar = useCallback(async () => {
    setError(null)
    try {
      const leidos = await Promise.all(origenes.map((o) => o.load()))
      setConfigs(Object.fromEntries(origenes.map((o, i) => [o.id, leidos[i]!])))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    // `origenes` se rehace en cada render; lo que de verdad manda es la
    // instancia (y si está arrancada, que cambia lo que se puede guardar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (buscando && configs === null) void cargar()
  }, [buscando, configs, cargar])

  // Al cambiar de servidor, lo leído ya no vale.
  useEffect(() => {
    setConfigs(null)
    setDrafts({})
    setQuery('')
  }, [id])

  function change(origen: string, option: ConfigOption, value: Draft): void {
    setNotice(null)
    setDrafts((prev) => {
      const actual = new Map(prev[origen] ?? [])
      if (sameAsOriginal(option, value)) actual.delete(pathKey(option.path))
      else actual.set(pathKey(option.path), value)
      return { ...prev, [origen]: actual }
    })
  }

  async function guardar(): Promise<void> {
    if (!configs) return
    setBusy(true)
    setError(null)
    try {
      const guardados: Record<string, EditableConfig> = { ...configs }
      for (const origen of origenes) {
        const borrador = drafts[origen.id]
        if (!borrador || borrador.size === 0) continue
        const changes = configs[origen.id]!.options
          .filter((option) => borrador.has(pathKey(option.path)))
          .map((option) => changeOf(option, borrador.get(pathKey(option.path))!))
        guardados[origen.id] = await origen.save(changes)
      }
      setConfigs(guardados)
      setDrafts({})
      setNotice(t('vh.settings.saved'))
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const resultados = origenes.map((origen) => ({
    origen,
    config: configs?.[origen.id],
    opciones: configs ? matches(configs[origen.id]!.options, query) : []
  }))
  const total = resultados.reduce((n, r) => n + (r.config?.options.length ?? 0), 0)
  const encontradas = resultados.reduce((n, r) => n + r.opciones.length, 0)
  const cambios = Object.values(drafts).reduce((n, m) => n + m.size, 0)

  return (
    <>
      <div className="config-search">
        <input
          type="search"
          value={query}
          placeholder={t('pz.search.placeholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {buscando && configs && (
          <span className="cfg-count">
            {t('cfg.countOf', { n: encontradas, total })}
            {cambios > 0 ? ` · ${t('pz.search.changed', { count: cambios })}` : ''}
          </span>
        )}
      </div>

      {buscando && (
        <div className="panel">
          {error && (
            <div className="alert error">
              <strong>{t('catalog.error')}</strong>
              <p>{error}</p>
            </div>
          )}
          {notice && <div className="alert info">{notice}</div>}

          {configs === null && !error && <p className="hint">{t('pz.search.reading')}</p>}

          {configs !== null && encontradas === 0 && (
            <p className="hint">{t('pz.search.none')}</p>
          )}

          {encontradas > 0 && (
            <div className="row cfg-actions">
              <button
                className="primary"
                disabled={busy || cambios === 0}
                onClick={() => void guardar()}
              >
                {busy ? t('common.saving') : t('common.saveChanges')}
              </button>
              {cambios > 0 && (
                <button disabled={busy} onClick={() => setDrafts({})}>
                  {t('cfg.discard')}
                </button>
              )}
              <button disabled={busy} onClick={() => setQuery('')}>
                {t('pz.search.exit')}
              </button>
            </div>
          )}

          {resultados.map(({ origen, config, opciones }) =>
            opciones.length === 0 ? null : (
              <div className="card" key={origen.id}>
                <h3>
                  {origen.title}{' '}
                  <span className="cfg-count">
                    · {t('cfg.countOf', { n: opciones.length, total: config!.options.length })}
                  </span>
                </h3>
                <p className="hint">{origen.help}</p>
                {origen.blocked && <div className="alert info">{origen.blocked}</div>}
                <OptionList
                  config={{ ...config!, options: opciones }}
                  drafts={drafts[origen.id] ?? new Map()}
                  disabled={busy || origen.blocked !== undefined}
                  onChange={(option, value) => change(origen.id, option, value)}
                />
              </div>
            )
          )}
        </div>
      )}
    </>
  )
}

/**
 * Las opciones que encajan con lo buscado.
 *
 * Se mira el nombre de la opción, el de la tabla que la contiene y la
 * explicación que escribe el juego: buscar «saqueo» tiene que encontrar
 * `LootRespawn`, que no se llama así en ningún sitio pero lo explica.
 */
function matches(options: ConfigOption[], query: string): ConfigOption[] {
  const palabras = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length > 0)
  if (palabras.length === 0) return []
  return options.filter((option) => {
    const texto = `${option.path.join('.')} ${option.description ?? ''}`.toLowerCase()
    return palabras.every((palabra) => texto.includes(palabra))
  })
}
