import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  DEFAULT_MAX_PLAYERS,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  type FactorioPreset
} from '@shared/games/factorio/types'
import { D20Loader } from '../../D20Loader'
import { GameSource, type GameSourceChoice } from './GameSource'

/**
 * Asistente en modo avanzado de Factorio: todo en una pantalla.
 *
 * Quien elige este modo sabe lo que hace, así que aquí sí aparecen la semilla,
 * el número de jugadores, el autoguardado y la verificación de cuentas. Lo que
 * sigue sin aparecer es RCON: no es una opción, es la única forma que tiene la
 * app de hablar con el servidor, y va atada a este equipo.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [source, setSource] = useState<GameSourceChoice | null>(null)
  const [name, setName] = useState('Mi fábrica')
  const [description, setDescription] = useState('')
  const [password, setPassword] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS)
  const [preset, setPreset] = useState<FactorioPreset>('default')
  const [seed, setSeed] = useState('')
  const [spaceAge, setSpaceAge] = useState(true)
  const [verifyAccounts, setVerifyAccounts] = useState(true)
  const [autoPause, setAutoPause] = useState(true)
  const [port, setPort] = useState(defaultPortFor('factorio'))
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spaceAgeImposible = source?.spaceAge === false
  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const canCreate = source !== null && name.trim().length > 0 && passwordOk && agreed

  async function create(): Promise<void> {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'factorio',
        name,
        port,
        expectedPlayers: maxPlayers,
        agreements: ['steam-subscriber'],
        exposure: { mode: connection },
        options: {
          source: source.source,
          ...(source.sourcePath ? { sourcePath: source.sourcePath } : {}),
          ...(source.steamUser ? { steamUser: source.steamUser } : {}),
          password: password.trim(),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          maxPlayers,
          preset,
          ...(seed.trim().length > 0 ? { seed: seed.trim() } : {}),
          spaceAge: spaceAge && !spaceAgeImposible,
          autoPause,
          verifyAccounts
        }
      })
      onCreated(manifest.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card loading-card" style={{ maxWidth: 620, margin: '40px auto 0' }}>
          <D20Loader size={84} />
          <div>
            <h3>Preparando tu servidor</h3>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? 'Trabajando...'}
            </p>
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>No se pudo preparar el servidor</strong>
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>Algo ha fallado</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>El juego</h3>
        <p className="hint">
          Factorio no tiene servidor aparte: el servidor es el propio juego, así que hace falta
          tenerlo. Se copia sin imágenes ni sonidos y queda en unos 250 MB.
        </p>
        <GameSource value={source} onChange={setSource} />
      </div>

      <div className="card">
        <h3>Servidor</h3>

        <div className="field">
          <label>Nombre</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">Es el que verán tus amigos al conectarse.</div>
        </div>

        <div className="field">
          <label>Descripción</label>
          <input
            value={description}
            maxLength={200}
            placeholder={`Servidor de ${name}`}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Contraseña</label>
          <input
            type="text"
            value={password}
            maxLength={40}
            placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres, o vacío`}
            onChange={(e) => setPassword(e.target.value)}
          />
          {!passwordOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              Hacen falta al menos {MIN_PASSWORD_LENGTH} caracteres, o ninguno.
            </div>
          )}
        </div>

        <div className="field">
          <label>Jugadores como mucho</label>
          <input
            type="number"
            min={1}
            max={64}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
        </div>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={verifyAccounts}
            onChange={(e) => setVerifyAccounts(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>Comprobar con factorio.com quién entra</strong>
            <div className="help" style={{ margin: 0 }}>
              Así nadie entra con el nombre de otro. El servidor consulta a{' '}
              <code>auth.factorio.com</code> al arrancar.
            </div>
          </span>
        </label>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPause}
            onChange={(e) => setAutoPause(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Pausar la partida cuando no queda nadie dentro</span>
        </label>
      </div>

      <div className="card">
        <h3>Mapa</h3>

        <div className="field">
          <label>Ajustes de generación</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as FactorioPreset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.id === preset)?.description}</div>
        </div>

        <div className="field">
          <label>Semilla</label>
          <input
            value={seed}
            placeholder="Vacío = al azar"
            onChange={(e) => setSeed(e.target.value)}
          />
          <div className="help">La misma semilla con los mismos ajustes da el mismo mapa.</div>
        </div>

        <label className="row" style={{ cursor: spaceAgeImposible ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={spaceAge && !spaceAgeImposible}
            disabled={spaceAgeImposible}
            onChange={(e) => setSpaceAge(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>Con Space Age</strong>
            <div className="help" style={{ margin: 0 }}>
              {spaceAgeImposible
                ? 'El Factorio elegido no trae la expansión.'
                : 'Se decide ahora y no se puede cambiar: el mapa se genera con la expansión o sin ella.'}
            </div>
          </span>
        </label>
      </div>

      <div className="card">
        <h3>Conexión</h3>

        <div className="field">
          <label>Puerto</label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            Uno solo, <strong>UDP</strong>. La consola remota que usa la app va en el siguiente,
            pero solo escucha en este equipo: no hay que abrirla.
          </div>
        </div>

        <div className="field">
          <label>¿Cómo van a entrar?</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">Solo en mi casa (misma red)</option>
            <option value="router">Abriendo el puerto en el router</option>
            <option value="tunnel">Con playit.gg</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Condiciones</h3>
        <p className="hint">
          El juego viene de Steam, copiado de tu instalación o descargado con tu cuenta.
        </p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            He leído y acepto el{' '}
            <a
              href={GAMES.factorio.agreements[0]!.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              Acuerdo de Suscriptor de Steam
            </a>
          </span>
        </label>
      </div>

      <div className="row">
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          Crear servidor
        </button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
