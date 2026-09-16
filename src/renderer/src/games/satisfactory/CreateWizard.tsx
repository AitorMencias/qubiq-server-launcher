import { useEffect, useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import { RELIABLE_PORT, SERVER_OPTIONS } from '@shared/games/satisfactory/types'
import { D20Loader } from '../../D20Loader'
import { MemoryNotice } from './MemoryNotice'

/**
 * Asistente de Satisfactory en modo avanzado: todo en un formulario.
 *
 * Lo que añade sobre el básico es control, no pasos: puerto, nombre de la
 * partida distinto del servidor y los ajustes del servidor que se pueden dejar
 * puestos desde el principio.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi fábrica')
  const [sessionName, setSessionName] = useState('')
  const [expectedPlayers, setExpectedPlayers] = useState(4)
  const [adminPassword, setAdminPassword] = useState('')
  const [clientPassword, setClientPassword] = useState('')
  const [port, setPort] = useState(defaultPortFor('satisfactory'))
  const [connection, setConnection] = useState<ExposureMode>('local')
  const [autosaveMinutes, setAutosaveMinutes] = useState(5)
  const [autoPause, setAutoPause] = useState(true)
  const [agreed, setAgreed] = useState(false)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.qubiq.system
      .memory()
      .then((memory) => setTotalMemoryMb(memory.totalMb))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    // El puerto propuesto es el primero libre en TCP y UDP a la vez: el juego
    // usa los dos, y uno UDP «reservable» no está libre de verdad (README).
    void window.qubiq.network
      .freePort(defaultPortFor('satisfactory'), 'tcp+udp')
      .then(setPort)
      .catch(() => undefined)
  }, [])

  const adminOk = adminPassword.trim().length >= 4

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'satisfactory',
        name,
        expectedPlayers,
        port,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          adminPassword: adminPassword.trim(),
          clientPassword: clientPassword.trim(),
          sessionName: sessionName.trim() || name.trim(),
          serverOptions: {
            'FG.AutosaveInterval': `${autosaveMinutes * 60}.0`,
            'FG.DSAutoPause': autoPause ? 'True' : 'False'
          }
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
              Descargando Satisfactory (unos 15 GB la primera vez). Después se arranca una vez para
              reclamarlo y crear la partida.
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
        <h3>1. Nombre</h3>
        <div className="field">
          <label>Nombre del servidor</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="field">
          <label>Nombre de la partida</label>
          <input
            value={sessionName}
            placeholder={name}
            onChange={(e) => setSessionName(e.target.value)}
            maxLength={40}
          />
          <div className="help">
            Agrupa los guardados y es lo que se ve al entrar. Si lo dejas vacío, se llama como el
            servidor.
          </div>
        </div>
      </div>

      <div className="card">
        <h3>2. Contraseñas</h3>
        <p className="hint">
          La de administrador manda en la partida y es la que usa esta app para hablar con el
          servidor. La otra es la que escriben tus amigos al entrar.
        </p>
        <div className="field">
          <label>Contraseña de administrador</label>
          <input
            type="text"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            maxLength={40}
            placeholder="Al menos 4 caracteres"
          />
        </div>
        <div className="field">
          <label>Contraseña para entrar</label>
          <input
            type="text"
            value={clientPassword}
            onChange={(e) => setClientPassword(e.target.value)}
            maxLength={40}
            placeholder="Vacío = sin contraseña"
          />
        </div>
      </div>

      <div className="card">
        <h3>3. Jugadores y conexión</h3>
        <div className="field">
          <label>Jugadores a la vez: {expectedPlayers}</label>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={expectedPlayers}
            onChange={(e) => setExpectedPlayers(Number(e.target.value))}
          />
          <div className="help">
            El juego trae cuatro de serie; la app sube el límite al arrancar. Por encima de ocho no
            hay nada garantizado y depende mucho de tu equipo.
          </div>
        </div>

        <div className="field">
          <label>Puerto</label>
          <input
            type="number"
            value={port}
            min={1024}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            Lo usan el juego (UDP) y el panel del servidor (TCP). Además, Satisfactory abre siempre
            el <strong>{RELIABLE_PORT}</strong> para su mensajería, y ese no se puede cambiar: por
            eso solo puede haber un servidor de Satisfactory en marcha a la vez.
          </div>
        </div>

        <div className="field">
          <label>¿Desde dónde se conectan?</label>
          <select value={connection} onChange={(e) => setConnection(e.target.value as ExposureMode)}>
            <option value="local">Solo desde mi red</option>
            <option value="router">Desde internet, abriendo el router</option>
            <option value="tunnel">Desde internet, con playit.gg</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h3>4. Ajustes de la partida</h3>
        <p className="hint">
          Se pueden cambiar en caliente desde Configuración → Ajustes, con el servidor arrancado.
        </p>
        <div className="field">
          <label>Guardado automático: cada {autosaveMinutes} min</label>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={autosaveMinutes}
            onChange={(e) => setAutosaveMinutes(Number(e.target.value))}
          />
          <div className="help">{SERVER_OPTIONS[0]!.help}</div>
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPause}
            onChange={(e) => setAutoPause(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Pausar la partida cuando no haya nadie conectado</span>
        </label>
      </div>

      <MemoryNotice totalMemoryMb={totalMemoryMb} players={expectedPlayers} />

      <div className="card">
        <h3>5. Condiciones</h3>
        <p className="hint">
          El servidor se descarga de Steam de forma anónima (15,5 GB). Steam pide aceptar su acuerdo
          para usar sus descargas.
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
              href={GAMES.satisfactory.agreements[0]!.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              Acuerdo de Suscriptor de Steam
            </a>
          </span>
        </label>
      </div>

      <div className="row between">
        <button onClick={onCancel}>Cancelar</button>
        <button
          className="primary"
          disabled={!agreed || !adminOk || name.trim().length === 0}
          onClick={() => void create()}
        >
          Crear servidor
        </button>
      </div>
    </div>
  )
}
