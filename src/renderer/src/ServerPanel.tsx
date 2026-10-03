import { useState } from 'react'
import type { Diagnosis, InstanceState, LogLine, UiMode } from '@shared/types'
import { capabilitiesFor, gameInfo, versionLabel } from '@shared/games'
import { uiFor } from './games'
import { useShareAddress, BasicConnection } from './BasicConnection'
import { ConnectionCard } from './ConnectionCard'
import { PlayersPanel } from './PlayersPanel'
import { ConsolePanel } from './ConsolePanel'
import { BackupPanel } from './BackupPanel'
import { ConfirmDelete } from './ConfirmDelete'
import { VersionCard } from './VersionCard'
import { D20Loader } from './D20Loader'
import { GameIcon } from './GameIcon'
import { LoadNotice } from './LoadNotice'
import { t } from './i18n'

/**
 * Pantalla de un servidor, igual en los dos modos.
 *
 * El día a día se reduce a tres cosas: encenderlo o apagarlo, ver quién está y
 * mirar la consola. Todo lo demás vive aparte, detrás de "Configuración", en
 * vez de competir por la atención cada vez que se abre la app.
 *
 * El modo no cambia la pantalla, cambia lo que se desbloquea dentro de
 * Configuración: cada pestaña recibe `mode` y el avanzado añade sus opciones
 * (memoria, semillas, retención de copias, las tres direcciones, la ficha
 * técnica, reinstalar...).
 *
 * No nombra ningún juego: las pestañas propias (Ajustes, Mundos, Plugins…) y la
 * ficha técnica las aporta el juego del servidor (`games/<juego>`).
 */

type MainTab = 'jugadores' | 'consola'
/** Pestañas comunes; las del juego llegan con su propio id. */
type CommonConfigTab = 'conexion' | 'copias' | 'servidor'

interface Props {
  state: InstanceState
  logs: LogLine[]
  players: string[]
  diagnosis: Diagnosis | null
  progress: { phase: string; progress: number | null; detail?: string } | null
  mode: UiMode
  onRefresh: () => void
}

export function ServerPanel({
  state,
  logs,
  players,
  diagnosis,
  progress,
  mode,
  onRefresh
}: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const [configuring, setConfiguring] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('jugadores')
  const [configTab, setConfigTab] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  /** El buscador del juego está enseñando resultados: tapan la pestaña. */
  const [searching, setSearching] = useState(false)
  /** Cambiarlo vuelve a montar el buscador, o sea, lo vacía. */
  const [searchNonce, setSearchNonce] = useState(0)
  const gameUi = uiFor(manifest)
  const capabilities = capabilitiesFor(manifest)

  const running = status === 'running'
  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  function run(action: () => Promise<void>): void {
    setError(null)
    void action()
      .then(onRefresh)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const topbar = (
    <div className="topbar">
      <GameIcon game={manifest.game} size={24} />
      <h2>{manifest.name}</h2>
      <span className="status">
        <span className={`dot ${status}`} />
        {statusLabel(status)}
        {state.uptimeSeconds !== null && ` · ${formatUptime(state.uptimeSeconds)}`}
      </span>
      {configuring ? (
        <button className="primary" onClick={() => setConfiguring(false)}>
          ← {t('panel.backToServer')}
        </button>
      ) : (
        <button onClick={() => setConfiguring(true)}>⚙ {t('panel.configuration')}</button>
      )}
    </div>
  )

  if (configuring) {
    // Los jugadores llegan por evento, no en el estado que se listó al abrir:
    // las pestañas del juego (moderar en Valheim) los necesitan al día.
    const gameTabs = gameUi.configTabs({ state: { ...state, players }, mode, onRefresh })
    const common = (id: CommonConfigTab, label: string): { id: string; label: string } => ({ id, label })
    const tabs = [
      ...gameTabs.filter((tab) => tab.slot === 'first'),
      common('conexion', t('panel.tab.connection')),
      ...gameTabs.filter((tab) => tab.slot === 'afterConnection'),
      common('copias', t('panel.tab.backups')),
      common('servidor', t('panel.tab.server'))
    ]
    // Sin elección previa se abre la primera pestaña, sea cual sea el juego.
    const activeTab = configTab && tabs.some((tab) => tab.id === configTab) ? configTab : tabs[0]!.id
    const activeGameTab = gameTabs.find((tab) => tab.id === activeTab)
    // Los juegos con cientos de ajustes repartidos en varias pestañas ponen su
    // propio buscador aquí arriba (Project Zomboid). Los demás no.
    const ConfigSearch = gameUi.ConfigSearch

    return (
      <>
        {topbar}
        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => {
                setConfigTab(tab.id)
                // Elegir una pestaña es decir «quiero esto», así que cierra la
                // búsqueda: si no, se quedaría tapando lo que se acaba de
                // pedir. Se cierra volviendo a montarla, que es lo que la deja
                // vacía sin que esta pantalla tenga que llevar su estado.
                if (searching) setSearchNonce((n) => n + 1)
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {ConfigSearch && (
          <ConfigSearch
            key={searchNonce}
            state={{ ...state, players }}
            mode={mode}
            onRefresh={onRefresh}
            onSearching={setSearching}
          />
        )}

        {/* Mientras la búsqueda enseña resultados, la pestaña no se pinta: lo
            que se busca puede estar en cualquiera de ellas. */}
        {!searching && activeGameTab?.render()}

        {!searching && activeTab === 'conexion' && (
          <div className="panel">
            {/* Básico: una sola dirección, la que hay que pasar. Avanzado: las
                tres, con latencia y la comprobación desde internet. */}
            {advanced ? (
              <ConnectionCard state={state} onManifestChanged={onRefresh} />
            ) : (
              <BasicConnection state={state} onManifestChanged={onRefresh} />
            )}
          </div>
        )}

        {!searching && activeTab === 'copias' && (
          <BackupPanel
            state={state}
            mode={mode}
            onManifestChanged={onRefresh}
            progressDetail={
              progress && (progress.phase === 'backup' || progress.phase === 'restore')
                ? (progress.detail ?? null)
                : null
            }
          />
        )}

        {!searching && activeTab === 'servidor' && (
          <div className="panel">
            {error && (
              <div className="alert error">
                <strong>{t('panel.actionFailed')}</strong>
                <p>{error}</p>
              </div>
            )}

            {/* Lo primero de la pestaña: es lo único de aquí que caduca solo y
                que puede dejar a los jugadores fuera si se queda atrás. */}
            <VersionCard state={state} mode={mode} onRefresh={onRefresh} />

            {/* Versión de Java, build y memoria no significan nada para quien
                solo quiere jugar: la ficha técnica es cosa del modo avanzado. */}
            {advanced && (
              <div className="card">
                <h3>{t('panel.details')}</h3>
                {gameUi.detailRows(manifest).map((row, i, rows) => (
                  <DetailRow key={row.label} label={row.label} value={row.value} last={i === rows.length - 1} />
                ))}
              </div>
            )}

            <div className="card">
              <h3>{advanced ? t('panel.maintenance') : t('panel.serverFolder')}</h3>
              <p className="hint">{t(`panel.folderHint.${gameInfo(manifest.game).save}`)}</p>
              <div className="row">
                <button onClick={() => void window.qubiq.instances.openFolder(manifest.id)}>
                  {t('panel.openFolder')}
                </button>
                {advanced && capabilities.reinstall && (
                  <button
                    disabled={running || busy}
                    onClick={() => run(() => window.qubiq.instances.reinstall(manifest.id))}
                  >
                    {t('panel.reinstall')}
                  </button>
                )}
              </div>
            </div>

            {/* Borrar está en los dos modos: querer deshacerse de un servidor es
                tan básico como crearlo. Lo que cambia es el aviso, no el acceso. */}
            <div className="card danger-zone">
              <h3>{t('panel.delete.title')}</h3>
              <p className="hint">
                {t(`panel.delete.hint.${gameInfo(manifest.game).save}`)}
                {!advanced && ` ${t('panel.delete.basicExtra')}`}
              </p>
              <button className="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                {t('panel.delete.button')}
              </button>
            </div>
          </div>
        )}

        {confirmingDelete && (
          <ConfirmDelete
            state={state}
            onCancel={() => setConfirmingDelete(false)}
            onDeleted={() => {
              setConfirmingDelete(false)
              onRefresh()
            }}
          />
        )}
      </>
    )
  }

  return (
    <>
      {topbar}

      <PowerCard state={state} diagnosis={diagnosis} progress={progress} error={error} onRun={run} />

      <div className="main-notices">
        {/* Antes de arrancar, si ya hay otros en marcha y no caben todos. */}
        <LoadNotice state={state} />

        {/* Lo que el juego tiene que decir sin esperar a que se abra
            Configuración: en Rust, que llega el borrado del mes. */}
        {gameUi.Notices && <gameUi.Notices state={state} mode={mode} onRefresh={onRefresh} />}
      </div>

      <div className="tabs">
        <button
          className={`tab ${mainTab === 'jugadores' ? 'active' : ''}`}
          onClick={() => setMainTab('jugadores')}
        >
          {t('panel.tab.players')} {players.length > 0 && `(${players.length})`}
        </button>
        <button
          className={`tab ${mainTab === 'consola' ? 'active' : ''}`}
          onClick={() => setMainTab('consola')}
        >
          {t('panel.tab.console')}
        </button>
      </div>

      {mainTab === 'jugadores' && (
        <PlayersPanel
          state={state}
          players={players}
          mode={mode}
          onRun={run}
          onRefresh={onRefresh}
        />
      )}
      {mainTab === 'consola' && <ConsolePanel state={state} logs={logs} onRun={run} />}
    </>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }): React.JSX.Element {
  return (
    <div className="row between" style={last ? undefined : { marginBottom: 8 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

interface PowerCardProps {
  state: InstanceState
  diagnosis: Diagnosis | null
  progress: { phase: string; progress: number | null; detail?: string } | null
  error: string | null
  onRun: (action: () => Promise<void>) => void
}

/**
 * El botón grande. Debajo, lo mínimo para usarlo: por qué no arranca si falla,
 * cómo va la instalación y la dirección que hay que pasar a los amigos, que
 * es lo siguiente que hace cualquiera nada más encenderlo.
 */
function PowerCard({ state, diagnosis, progress, error, onRun }: PowerCardProps): React.JSX.Element {
  const { manifest, status } = state
  const { address, note, missing } = useShareAddress(state)
  const [copied, setCopied] = useState(false)

  const on = status === 'running' || status === 'starting'
  const busy = status === 'starting' || status === 'stopping' || status === 'installing'

  const label = (() => {
    switch (status) {
      case 'running':
        return t('panel.power.stop')
      case 'starting':
        return t('panel.power.starting')
      case 'stopping':
        return t('panel.power.stopping')
      case 'installing':
        return t('panel.power.installing')
      default:
        return t('panel.power.start')
    }
  })()

  async function copy(): Promise<void> {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="power-area">
      <button
        className={`power-button ${on ? 'on' : 'off'}`}
        disabled={busy}
        onClick={() =>
          onRun(() =>
            status === 'running'
              ? window.qubiq.server.stop(manifest.id)
              : window.qubiq.server.start(manifest.id)
          )
        }
      >
        {busy && <D20Loader size={40} />}
        {label}
      </button>

      {error && (
        <div className="alert error">
          <strong>{t('panel.actionFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      {diagnosis && (
        <div className="alert error">
          <strong>{diagnosis.title}</strong>
          <p>{diagnosis.detail}</p>
        </div>
      )}

      {progress && status === 'installing' && (
        <div className="power-progress">
          <p className="hint">{progress.detail ?? t('panel.working')}</p>
          {/* El botón ya lleva el dado girando: la barra solo con porcentaje real. */}
          {progress.progress != null && (
            <div className="progress">
              <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="share-line">
        {address ? (
          <>
            <span className="share-label">{t('panel.shareLabel')}</span>
            <code className="share-address" title={note}>
              {address}
            </code>
            <button onClick={() => void copy()}>{copied ? t('panel.copied') : t('panel.copy')}</button>
          </>
        ) : (
          <span className="share-label">{missing}</span>
        )}
      </div>
      <div className="share-note">
        {address && `${note} `}{versionLabel(manifest)}.
      </div>
    </div>
  )
}

function statusLabel(status: InstanceState['status']): string {
  switch (status) {
    case 'running':
      return t('status.running')
    case 'starting':
      return t('status.starting')
    case 'stopping':
      return t('status.stopping')
    case 'installing':
      return t('status.installing')
    case 'crashed':
      return t('status.crashed')
    case 'stopped':
      return t('status.stopped')
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return t('panel.uptime.hours', { h, m })
  return t('panel.uptime.minutes', { m })
}
