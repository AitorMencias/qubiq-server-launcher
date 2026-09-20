import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  BASIC_SANDBOX,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_MEMORY_MB,
  MAX_MEMORY_MB,
  MAX_PLAYERS,
  MIN_MEMORY_MB,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  presetInfo,
  udpPortFor,
  type ZomboidPreset
} from '@shared/games/zomboid/types'
import { D20Loader } from '../../D20Loader'

/**
 * Asistente de Project Zomboid en modo avanzado: todo en un formulario.
 *
 * Sobre el básico añade el puerto, la memoria, el límite de jugadores, el PvP,
 * la contraseña del servidor, si se puede entrar sin cuenta creada, las seis
 * reglas de partida que más se notan y Steam, que es la única opción de esta
 * pantalla que saca algo hacia fuera y por eso va con su aviso.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi Zomboid')
  const [adminPassword, setAdminPassword] = useState('')
  const [password, setPassword] = useState('')
  const [description, setDescription] = useState('')
  const [port, setPort] = useState(defaultPortFor('zomboid'))
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_MAX_PLAYERS)
  const [memoryMb, setMemoryMb] = useState(DEFAULT_MEMORY_MB)
  const [pvp, setPvp] = useState(false)
  const [openToNewPlayers, setOpenToNewPlayers] = useState(true)
  const [useSteam, setUseSteam] = useState(false)
  const [preset, setPreset] = useState<ZomboidPreset>('survivor')
  const [sandbox, setSandbox] = useState<Record<string, number>>({})
  const [connection, setConnection] = useState<ExposureMode>('local')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.qubiq.network
      .freePort(defaultPortFor('zomboid'), 'udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const adminOk = adminPassword.trim().length >= MIN_PASSWORD_LENGTH && !/["\s]/.test(adminPassword)
  const passwordOk = password.trim().length === 0 || password.trim().length >= MIN_PASSWORD_LENGTH
  const canCreate = agreed && adminOk && passwordOk && name.trim().length > 0

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'zomboid',
        name,
        port,
        expectedPlayers: maxPlayers,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          password: password.trim(),
          description: description.trim(),
          maxPlayers,
          memoryMb,
          pvp,
          openToNewPlayers,
          useSteam,
          preset,
          ...(Object.keys(sandbox).length > 0 ? { sandbox } : {})
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
            <p className="hint">
              Descargando Project Zomboid (unos 6,7 GB). Después arranca una vez para generar el
              mundo y escribir su configuración, que lleva otro minuto y medio.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>{progress?.detail ?? 'Trabajando...'}</p>
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
        <h3>Servidor</h3>

        <div className="field">
          <label>Nombre</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>Descripción</label>
          <input
            value={description}
            maxLength={120}
            placeholder="Opcional"
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="help">Se ve en la ficha del servidor dentro del juego.</div>
        </div>

        <div className="field">
          <label>Contraseña de administrador</label>
          <input
            type="text"
            value={adminPassword}
            maxLength={40}
            placeholder={`Al menos ${MIN_PASSWORD_LENGTH} caracteres, sin espacios`}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <div className="help">
            Entrarás con el usuario <strong>admin</strong> y esta contraseña.
          </div>
          {adminPassword.trim().length > 0 && !adminOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              Al menos {MIN_PASSWORD_LENGTH} caracteres, sin espacios ni comillas.
            </div>
          )}
        </div>

        <div className="field">
          <label>Contraseña del servidor</label>
          <input
            type="text"
            value={password}
            maxLength={40}
            placeholder="Vacío = entra cualquiera que tenga la dirección"
            onChange={(e) => setPassword(e.target.value)}
          />
          {!passwordOk && (
            <div className="help" style={{ color: 'var(--danger)' }}>
              Al menos {MIN_PASSWORD_LENGTH} caracteres, o ninguno.
            </div>
          )}
        </div>

        <div className="field">
          <label>Jugadores como mucho</label>
          <input
            type="number"
            min={1}
            max={MAX_PLAYERS}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
        </div>

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
            Es <strong>UDP</strong>. Con Steam encendido, el juego usa además el siguiente (
            {udpPortFor(port)}).
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

        <div className="field">
          <label>Memoria: {(memoryMb / 1024).toFixed(1)} GB</label>
          <input
            type="range"
            min={MIN_MEMORY_MB}
            max={MAX_MEMORY_MB}
            step={512}
            value={memoryMb}
            onChange={(e) => setMemoryMb(Number(e.target.value))}
          />
          <div className="help">
            Se reserva al arrancar, porque es un servidor de Java. Lo que la dispara es el mapa
            explorado, no cuántos seáis.
          </div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={pvp}
            onChange={(e) => setPvp(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Los jugadores pueden hacerse daño entre ellos (PvP)</span>
        </label>

        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={openToNewPlayers}
            onChange={(e) => setOpenToNewPlayers(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Cualquiera puede crearse su cuenta al entrar</span>
        </label>
        <div className="help">
          Si lo quitas, el servidor funciona por lista: tendrás que dar de alta a cada jugador desde
          Moderación.
        </div>
      </div>

      <div className="card">
        <h3>Steam</h3>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useSteam}
            onChange={(e) => setUseSteam(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Arrancar el servidor con Steam</span>
        </label>
        <div className="alert info" style={{ marginTop: 10 }}>
          <strong>Con Steam, tu servidor sale en la lista pública</strong>
          <p>
            Lo avisa el propio juego: un servidor con Steam <strong>siempre</strong> aparece en el
            navegador de servidores de Steam, con tu dirección de internet, aunque no lo publiques.
            A cambio tienes el antitrampas VAC y la app puede preguntarle su estado. Sin Steam se
            entra igual de bien escribiendo la dirección a mano.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Dificultad</h3>
        <div className="field">
          <label>Preajuste</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as ZomboidPreset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="help">{presetInfo(preset).description}</div>
        </div>

        <p className="hint">
          Estas seis son las reglas que más se notan. Las otras trescientas están en Configuración →
          Partida en cuanto el servidor esté creado.
        </p>

        {BASIC_SANDBOX.map((choice) => (
          <div className="field" key={choice.key}>
            <label>{choice.label}</label>
            <select
              value={sandbox[choice.key] === undefined ? '' : String(sandbox[choice.key])}
              onChange={(e) =>
                setSandbox((prev) => {
                  const next = { ...prev }
                  if (e.target.value === '') delete next[choice.key]
                  else next[choice.key] = Number(e.target.value)
                  return next
                })
              }
            >
              <option value="">Lo que traiga la dificultad</option>
              {choice.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="help">{choice.help}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Condiciones</h3>
        <p className="hint">
          El servidor se descarga de Steam de forma anónima, sin cuenta ni contraseña.
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
              href={GAMES.zomboid.agreements[0]!.url}
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
