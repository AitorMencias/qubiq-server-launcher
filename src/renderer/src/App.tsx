import { useCallback, useEffect, useState } from 'react'
import type { Diagnosis, GameId, InstanceState, LogLine, ProgressUpdate, UiMode } from '@shared/types'
import { GAME_IDS, appSubtitle, disclaimerLines, gameInfo, summaryLabel } from '@shared/games'
import { setLanguage, type Language } from '@shared/i18n'
import { GAME_UI } from './games'
import { GameChooser } from './GameChooser'
import { GameIcon } from './GameIcon'
import { ModeChooser } from './ModeChooser'
import { ServerPanel } from './ServerPanel'
import { SettingsScreen } from './SettingsScreen'
import { applyDocumentLanguage, t } from './i18n'

/** Límite de líneas en memoria: la consola no puede crecer sin fin. */
const MAX_LOG_LINES = 2000

interface Props {
  /** El idioma con el que se ha arrancado (el elegido o el de Windows). */
  initialLanguage: Language
  systemLanguage: Language
}

export function App({ initialLanguage, systemLanguage }: Props): React.JSX.Element {
  const [instances, setInstances] = useState<InstanceState[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * Flujo de creación: juego (solo si hay más de uno), modo (como Vibe/Spec en
   * Kiro) y el asistente de ese juego en ese modo.
   */
  const [creating, setCreating] = useState<null | 'game' | 'choosing' | UiMode>(null)
  const [createGame, setCreateGame] = useState<GameId>(GAME_IDS[0]!)
  /** La configuración de la app, en el área principal en lugar de un servidor. */
  const [showSettings, setShowSettings] = useState(false)
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [players, setPlayers] = useState<Record<string, string[]>>({})
  /** Cuántos hay dentro en los juegos que no dan nombres (Satisfactory). */
  const [playerCounts, setPlayerCounts] = useState<Record<string, number | null>>({})
  /** Código para entrar en los juegos que van por relé (Valheim con crossplay). */
  const [joinCodes, setJoinCodes] = useState<Record<string, string | null>>({})
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  const [diagnoses, setDiagnoses] = useState<Record<string, Diagnosis>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  // Se arranca en básico hasta saber qué prefiere el usuario: es el valor por
  // defecto del núcleo y evita un parpadeo a avanzado en el primer render.
  const [mode, setMode] = useState<UiMode>('basic')
  /**
   * El idioma en uso. Vive aquí para que cambiarlo vuelva a pintar todo el
   * árbol: los textos se piden al pintar, así que salen ya en el nuevo, y nada
   * se remonta (la consola y las pantallas abiertas siguen como estaban).
   */
  const [language, setLanguageState] = useState<Language>(initialLanguage)
  /** El elegido en la configuración; undefined si sigue al de Windows. */
  const [chosenLanguage, setChosenLanguage] = useState<Language | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const list = await window.qubiq.instances.list()
      setInstances(list)
      setLoadError(null)
      setSelectedId((current) => {
        if (current && list.some((i) => i.manifest.id === current)) return current
        return list[0]?.manifest.id ?? null
      })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.qubiq.settings
      .get()
      .then((settings) => {
        setMode(settings.uiMode)
        setChosenLanguage(settings.language)
      })
      .catch(() => undefined)
  }, [])

  function changeMode(next: UiMode): void {
    setMode(next)
    void window.qubiq.settings.update({ uiMode: next }).catch(() => undefined)
  }

  function changeLanguage(next: Language | undefined): void {
    const effective = next ?? systemLanguage
    setLanguage(effective)
    applyDocumentLanguage(effective)
    setChosenLanguage(next)
    setLanguageState(effective)
    void window.qubiq.settings.update({ language: next }).catch(() => undefined)
  }

  /** Empieza a crear: con un único juego se salta la elección de juego. */
  function startCreate(): void {
    setShowSettings(false)
    if (GAME_IDS.length > 1) {
      setCreating('game')
      return
    }
    setCreateGame(GAME_IDS[0]!)
    setCreating('choosing')
  }

  function onInstanceCreated(id: string): void {
    setCreating(null)
    setSelectedId(id)
    void refresh()
  }

  // Suscripción a los eventos del núcleo.
  useEffect(() => {
    const offLog = window.qubiq.on.log((id, line) => {
      setLogs((prev) => {
        const next = [...(prev[id] ?? []), line]
        if (next.length > MAX_LOG_LINES) next.splice(0, next.length - MAX_LOG_LINES)
        return { ...prev, [id]: next }
      })
    })

    const offStatus = window.qubiq.on.status((id, status) => {
      setInstances((prev) =>
        prev.map((i) => (i.manifest.id === id ? { ...i, status } : i))
      )
      // Un arranque correcto invalida el diagnóstico anterior.
      if (status === 'running') {
        setDiagnoses((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    })

    const offPlayers = window.qubiq.on.players((id, list, count) => {
      setPlayers((prev) => ({ ...prev, [id]: list }))
      setPlayerCounts((prev) => ({ ...prev, [id]: count }))
    })

    const offJoinCode = window.qubiq.on.joinCode((id, code) => {
      setJoinCodes((prev) => ({ ...prev, [id]: code }))
    })

    const offProgress = window.qubiq.on.progress((update) => setProgress(update))

    const offDiagnosis = window.qubiq.on.diagnosis((id, diagnosis) => {
      setDiagnoses((prev) => ({ ...prev, [id]: diagnosis }))
    })

    return () => {
      offLog()
      offStatus()
      offPlayers()
      offJoinCode()
      offProgress()
      offDiagnosis()
    }
  }, [])

  // Refresco del contador de tiempo en marcha.
  useEffect(() => {
    const timer = setInterval(() => {
      setInstances((prev) =>
        prev.map((i) =>
          i.status === 'running' && i.uptimeSeconds !== null
            ? { ...i, uptimeSeconds: i.uptimeSeconds + 1 }
            : i
        )
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const selected = instances.find((i) => i.manifest.id === selectedId) ?? null

  return (
    <div className="app" data-language={language}>
      <aside className="sidebar">
        <div className="brand">
          <h1>QubiQ Server Launcher</h1>
          <p>{appSubtitle()}</p>
        </div>

        <div className="instance-list">
          {instances.length === 0 && creating === null && (
            <p style={{ color: 'var(--muted)', fontSize: 12, padding: 12 }}>
              {t('app.noServersYet')}
            </p>
          )}
          {instances.map((instance) => (
            <div
              key={instance.manifest.id}
              className={`instance-item ${
                instance.manifest.id === selectedId && creating === null && !showSettings
                  ? 'active'
                  : ''
              }`}
              onClick={() => {
                setSelectedId(instance.manifest.id)
                setCreating(null)
                setShowSettings(false)
              }}
            >
              <GameIcon game={instance.manifest.game} size={30} />
              <div className="text">
                <div className="name">{instance.manifest.name}</div>
                <div className="meta">
                  <span className={`dot ${instance.status}`} style={{ display: 'inline-block' }} />{' '}
                  {summaryLabel(instance.manifest)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="primary" onClick={startCreate}>
            {t('app.createServer')}
          </button>

          <div className="mode-switch">
            <label htmlFor="ui-mode">{t('app.mode')}</label>
            <select
              id="ui-mode"
              value={mode}
              onChange={(e) => changeMode(e.target.value as UiMode)}
            >
              <option value="basic">{t('mode.basic')}</option>
              <option value="advanced">{t('mode.advanced')}</option>
            </select>
          </div>
          <p className="mode-hint">
            {mode === 'basic' ? t('app.modeHint.basic') : t('app.modeHint.advanced')}
          </p>

          <button
            className={`app-settings-button ${showSettings ? 'active' : ''}`}
            onClick={() => {
              setCreating(null)
              setShowSettings(true)
            }}
          >
            <span aria-hidden="true">⚙</span> {t('app.settings')}
          </button>
        </div>

        <div className="disclaimer">
          {disclaimerLines().map((line) => (
            <p key={line} style={{ margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
      </aside>

      <main className="content">
        {showSettings && (
          <SettingsScreen
            mode={mode}
            onModeChange={changeMode}
            language={chosenLanguage}
            systemLanguage={systemLanguage}
            onLanguageChange={changeLanguage}
            onClose={() => setShowSettings(false)}
          />
        )}

        {!showSettings && loadError && (
          <div className="panel">
            <div className="alert error">
              <strong>{t('app.loadError')}</strong>
              <p>{loadError}</p>
            </div>
          </div>
        )}

        {!showSettings && creating !== null && (
          <>
            <div className="topbar">
              {creating !== 'game' && <GameIcon game={createGame} size={24} />}
              <h2>
                {GAME_IDS.length > 1 && creating !== 'game'
                  ? t('app.create.titleGame', { game: gameInfo(createGame).name })
                  : t('app.create.title')}
              </h2>
              {creating !== 'choosing' && creating !== 'game' && (
                <span className="status">
                  {creating === 'basic' ? t('app.create.modeBasic') : t('app.create.modeAdvanced')}
                </span>
              )}
              {creating !== 'choosing' && creating !== 'game' && (
                <button onClick={() => setCreating('choosing')}>{t('app.create.changeMode')}</button>
              )}
            </div>

            {creating === 'game' && (
              <GameChooser
                onCancel={() => setCreating(null)}
                onChoose={(game) => {
                  setCreateGame(game)
                  setCreating('choosing')
                }}
              />
            )}

            {creating === 'choosing' && (
              <ModeChooser
                current={mode}
                onCancel={() => setCreating(null)}
                onChoose={(chosen) => {
                  // La elección aquí también fija el modo de la app: es la
                  // preferencia que el usuario acaba de expresar, y así el
                  // panel del servidor recién creado le habla igual.
                  changeMode(chosen)
                  setCreating(chosen)
                }}
              />
            )}

            {creating === 'basic' && (() => {
              const Wizard = GAME_UI[createGame].BasicWizard
              return (
                <Wizard
                  progress={progress}
                  onCancel={() => setCreating(null)}
                  onCreated={onInstanceCreated}
                />
              )
            })()}

            {creating === 'advanced' && (() => {
              const Wizard = GAME_UI[createGame].AdvancedWizard
              return (
                <Wizard
                  progress={progress}
                  onCancel={() => setCreating(null)}
                  onCreated={onInstanceCreated}
                />
              )
            })()}
          </>
        )}

        {!showSettings && creating === null && selected && (
          <ServerPanel
            // Cambiar de servidor vuelve a su pantalla principal, en vez de
            // arrastrar la pestaña o la configuración que tenía abiertas el otro.
            key={selected.manifest.id}
            state={{
              ...selected,
              // El recuento llega por evento, igual que la lista de nombres.
              playerCount: playerCounts[selected.manifest.id] ?? selected.playerCount,
              // Y el código para entrar, que el juego genera en cada arranque.
              joinCode: joinCodes[selected.manifest.id] ?? selected.joinCode
            }}
            logs={logs[selected.manifest.id] ?? []}
            players={players[selected.manifest.id] ?? []}
            diagnosis={diagnoses[selected.manifest.id] ?? null}
            progress={progress?.instanceId === selected.manifest.id ? progress : null}
            mode={mode}
            onRefresh={() => void refresh()}
          />
        )}

        {!showSettings && creating === null && !selected && !loadError && (
          <div className="empty">
            <div style={{ fontSize: 44 }}>🧊</div>
            <div>
              <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text)' }}>
                {t('app.empty.title')}
              </strong>
              {t('app.empty.text')}
            </div>
            <button className="primary" onClick={startCreate}>
              {t('app.empty.button')}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
