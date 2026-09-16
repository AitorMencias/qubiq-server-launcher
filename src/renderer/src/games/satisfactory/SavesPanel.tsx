import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { SatisfactorySave, SatisfactorySessions } from '@shared/games/satisfactory/types'

/**
 * Partidas de un servidor de Satisfactory: lo que en Minecraft son los mundos.
 *
 * Una «partida» (sesión) agrupa sus guardados, y el servidor carga uno de
 * ellos. Todo pasa por la API, así que hace falta el servidor arrancado; y como
 * cargar o borrar se lleva por delante lo que no esté guardado, cada acción
 * dice antes qué va a pasar y el núcleo hace una copia por su cuenta.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onChanged: () => void
}

export function SavesPanel({ state, mode, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status === 'running'
  const advanced = mode === 'advanced'

  const [data, setData] = useState<SatisfactorySessions | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newSession, setNewSession] = useState('')
  const [confirmingSession, setConfirmingSession] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!running) return
    try {
      setData(await window.qubiq.satisfactory.sessions.list(manifest.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id, running])

  useEffect(() => {
    void load()
  }, [load])

  function run(action: () => Promise<SatisfactorySessions>, done: string): void {
    setBusy(true)
    setError(null)
    setNotice(null)
    action()
      .then((result) => {
        setData(result)
        setNotice(done)
        onChanged()
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  if (!running) {
    return (
      <div className="panel">
        <div className="alert info">
          <strong>Arranca el servidor para ver las partidas</strong>
          <p>
            Las partidas las lleva el propio servidor: es él quien sabe cuáles hay, cuál está
            cargada y cuándo se guardó cada una. Con el servidor parado no hay a quién preguntar.
          </p>
        </div>
      </div>
    )
  }

  const current = data?.currentSessionName ?? null

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo completar la acción</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="alert info">
          <p style={{ margin: 0 }}>{notice}</p>
        </div>
      )}

      <div className="card">
        <h3>Guardar ahora</h3>
        <p className="hint">
          El servidor guarda solo cada pocos minutos (se cambia en Ajustes) y siempre al cerrarse.
          Esto fuerza un guardado inmediato, por ejemplo antes de tocar algo gordo.
        </p>
        <button
          disabled={busy || !current}
          onClick={() =>
            run(
              () => window.qubiq.satisfactory.sessions.saveNow(manifest.id, current ?? ''),
              'Partida guardada.'
            )
          }
        >
          Guardar la partida
        </button>
      </div>

      {(data?.sessions ?? []).map((session) => (
        <div className="card" key={session.sessionName}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>
              {session.sessionName}
              {session.sessionName === current && (
                <span className="status" style={{ marginLeft: 8 }}>
                  cargada ahora
                </span>
              )}
            </h3>
            {session.sessionName !== current && (
              <button
                className="danger"
                disabled={busy}
                onClick={() => setConfirmingSession(session.sessionName)}
              >
                Borrar partida
              </button>
            )}
          </div>

          {confirmingSession === session.sessionName && (
            <div className="alert error" style={{ textAlign: 'left' }}>
              <strong>¿Borrar «{session.sessionName}» con sus {session.saves.length} guardados?</strong>
              <p>
                Se pierde todo lo construido en esa partida. Antes se hace una copia de seguridad,
                que podrás restaurar desde la pestaña Copias.
              </p>
              <div className="row">
                <button onClick={() => setConfirmingSession(null)}>Cancelar</button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingSession(null)
                    run(
                      () =>
                        window.qubiq.satisfactory.sessions.removeSession(
                          manifest.id,
                          session.sessionName
                        ),
                      `Partida «${session.sessionName}» borrada.`
                    )
                  }}
                >
                  Sí, borrarla
                </button>
              </div>
            </div>
          )}

          {session.saves.map((save) => (
            <SaveRow
              key={save.saveName}
              save={save}
              advanced={advanced}
              busy={busy}
              onLoad={() =>
                run(
                  () =>
                    window.qubiq.satisfactory.sessions.load(
                      manifest.id,
                      save.saveName,
                      save.sessionName
                    ),
                  `Cargando «${save.saveName}». El servidor tarda unos segundos en tenerla lista.`
                )
              }
              onDelete={() =>
                run(
                  () => window.qubiq.satisfactory.sessions.removeSave(manifest.id, save.saveName),
                  `Guardado «${save.saveName}» borrado.`
                )
              }
            />
          ))}
        </div>
      ))}

      <div className="card">
        <h3>Empezar una partida nueva</h3>
        <p className="hint">
          Se crea un mapa desde cero y el servidor se pasa a él. La partida de ahora <strong>no</strong>{' '}
          se borra: sigue en esta lista y puedes volver cuando quieras.
        </p>
        <div className="field">
          <input
            value={newSession}
            maxLength={40}
            placeholder="Nombre de la partida"
            onChange={(e) => setNewSession(e.target.value)}
          />
        </div>
        <button
          className="primary"
          disabled={busy || newSession.trim().length === 0}
          onClick={() =>
            run(
              () => window.qubiq.satisfactory.sessions.create(manifest.id, newSession.trim()),
              `Creando «${newSession.trim()}». El servidor tarda un poco en generar el mapa.`
            )
          }
        >
          Crear partida
        </button>
      </div>
    </div>
  )
}

interface SaveRowProps {
  save: SatisfactorySave
  advanced: boolean
  busy: boolean
  onLoad: () => void
  onDelete: () => void
}

function SaveRow({ save, advanced, busy, onLoad, onDelete }: SaveRowProps): React.JSX.Element {
  return (
    <div className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div>
        <div>{save.saveName}</div>
        <div className="hint">
          {formatDate(save.savedAt)} · {formatDuration(save.playDurationSeconds)} jugadas
          {save.creativeModeEnabled && ' · con reglas cambiadas'}
          {advanced && ` · build ${save.buildVersion}`}
        </div>
      </div>
      <div className="row">
        <button disabled={busy} onClick={onLoad}>
          Cargar
        </button>
        {advanced && (
          <button className="danger" disabled={busy} onClick={onDelete}>
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}
