import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, WorldInfo } from '@shared/types'
import { LEVEL_TYPES } from '@shared/types'

/**
 * Gestión de mundos (§8).
 *
 * Un servidor solo puede tener un mundo activo a la vez: el que indica
 * `level-name`. Aquí se ven todos los que hay en la carpeta, se cambia de uno a
 * otro y se crean o borran. Todo exige el servidor parado, porque lo reescribe
 * al cerrarse.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function WorldsPanel({ state, onChanged }: Props): React.JSX.Element {
  const { manifest, status } = state
  const running = status !== 'stopped' && status !== 'crashed'

  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [levelType, setLevelType] = useState(LEVEL_TYPES[0]!.value)

  const refresh = useCallback(async () => {
    try {
      setWorlds(await window.qubiq.worlds.list(manifest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  async function run(action: () => Promise<WorldInfo[]>, message: string): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setWorlds(await action())
      setNotice(message)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function create(): Promise<void> {
    await run(
      () =>
        window.qubiq.worlds.create(manifest.id, {
          name: name.trim(),
          seed: seed.trim() || undefined,
          levelType
        }),
      `Mundo "${name.trim()}" creado. Se generará al arrancar el servidor.`
    )
    setName('')
    setSeed('')
    setCreating(false)
  }

  async function activate(world: WorldInfo): Promise<void> {
    await run(
      () => window.qubiq.worlds.activate(manifest.id, world.name),
      `Ahora se jugará en "${world.name}". Arranca el servidor para entrar.`
    )
  }

  async function remove(world: WorldInfo): Promise<void> {
    const ok = window.confirm(
      `¿Borrar el mundo "${world.name}"?\n\n` +
        `Se perderá todo lo construido en él (${formatSize(world.sizeBytes)}). ` +
        'Esto no se puede deshacer.\n\n' +
        'Si quieres conservarlo por si acaso, cancela y haz antes una copia de seguridad.'
    )
    if (!ok) return

    await run(
      () => window.qubiq.worlds.remove(manifest.id, world.name),
      `Mundo "${world.name}" borrado.`
    )
  }

  return (
    <div className="panel">
      {running && (
        <div className="alert info">
          <strong>Para el servidor para gestionar los mundos</strong>
          <p>
            Cambiar de mundo, crear uno nuevo o borrarlo requiere que el servidor esté parado: en
            marcha reescribe su configuración al cerrarse y se perderían los cambios.
          </p>
        </div>
      )}

      {error && (
        <div className="alert error">
          <strong>No se pudo completar la operación</strong>
          <p>{error}</p>
        </div>
      )}

      {notice && !error && (
        <div className="alert info">
          <strong>Listo</strong>
          <p>{notice}</p>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Mundos de este servidor</h3>
          {!creating && (
            <button
              className="primary"
              disabled={running || busy}
              style={{ flexShrink: 0 }}
              onClick={() => setCreating(true)}
            >
              + Crear mundo
            </button>
          )}
        </div>
        <p className="hint">
          Puedes tener varios mundos guardados, pero solo se juega en uno cada vez. Cambiar de
          mundo no borra los demás.
        </p>

        <div className="player-list">
          {worlds.map((world) => (
            <div className="player" key={world.name}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {world.name}
                  {world.active && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--ok)',
                        fontWeight: 400
                      }}
                    >
                      ● en uso
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {world.generated ? (
                    <>
                      {formatSize(world.sizeBytes)}
                      {world.lastPlayed && ` · última partida ${formatDate(world.lastPlayed)}`}
                      {world.legacyFolders.length > 0 && ' · incluye Nether y End aparte'}
                    </>
                  ) : (
                    'Aún sin generar: se creará al arrancar el servidor'
                  )}
                </div>
              </div>

              {!world.active && world.generated && (
                <button disabled={running || busy} onClick={() => void activate(world)}>
                  Jugar en este
                </button>
              )}
              {!world.active && (
                <button
                  className="danger"
                  disabled={running || busy}
                  onClick={() => void remove(world)}
                >
                  Borrar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <div className="card">
          <h3>Crear un mundo nuevo</h3>
          <p className="hint">
            El mundo se genera la primera vez que arranques el servidor. El actual no se toca: se
            queda guardado y puedes volver a él cuando quieras.
          </p>

          <div className="field">
            <label>Nombre</label>
            <input
              value={name}
              maxLength={40}
              placeholder="Por ejemplo: aventura-2"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="help">Es también el nombre de la carpeta, así que evita símbolos raros.</div>
          </div>

          <div className="field">
            <label>Tipo de mundo</label>
            <select value={levelType} onChange={(e) => setLevelType(e.target.value)}>
              {LEVEL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <div className="help">
              {LEVEL_TYPES.find((t) => t.value === levelType)?.help}
            </div>
          </div>

          <div className="field">
            <label>Semilla (opcional)</label>
            <input
              value={seed}
              placeholder="Déjalo vacío para un mundo aleatorio"
              onChange={(e) => setSeed(e.target.value)}
            />
            <div className="help">
              La semilla determina el terreno. Si repites la misma semilla y el mismo tipo,
              obtienes exactamente el mismo mundo.
            </div>
          </div>

          <div className="row between">
            <button
              onClick={() => {
                setCreating(false)
                setName('')
                setSeed('')
              }}
            >
              Cancelar
            </button>
            <button
              className="primary"
              disabled={running || busy || name.trim().length === 0}
              onClick={() => void create()}
            >
              Crear mundo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return 'vacío'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
