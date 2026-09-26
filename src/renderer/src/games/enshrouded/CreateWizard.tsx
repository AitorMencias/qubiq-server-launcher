import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  DEFAULT_QUERY_PORT,
  MAX_PLAYERS,
  PRESETS,
  TAGS,
  roleProblems,
  type EnshroudedPreset,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import { D20Loader } from '../../D20Loader'
import { CheckRow } from '../../CheckRow'
import { RolesEditor } from './RolesEditor'
import { rolesFor } from './roles'
import { suggestPassword } from './BasicWizard'

/**
 * Asistente en modo avanzado de Enshrouded: un formulario con todo a la vista.
 *
 * Lo que añade sobre el básico: el puerto, los cuatro roles con sus permisos
 * uno a uno, las etiquetas con las que sale en la lista del juego y el chat.
 * Los ajustes finos de la partida no están aquí a propósito: son treinta y
 * siete y tienen su propia pantalla, donde caben con su explicación.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi Enshrouded')
  const [worldName, setWorldName] = useState('')
  const [port, setPort] = useState(DEFAULT_QUERY_PORT)
  const [players, setPlayers] = useState(4)
  const [preset, setPreset] = useState<EnshroudedPreset>('Default')
  const [roles, setRoles] = useState<EnshroudedRole[]>(() =>
    rolesFor(suggestPassword(), suggestPassword())
  )
  const [tags, setTags] = useState<string[]>([])
  const [textChat, setTextChat] = useState(true)
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const world = worldName.trim() || name.trim()
  const rolesProblem = roleProblems(roles)
  const canCreate = agreed && name.trim().length > 0 && world.length > 0 && rolesProblem === null

  function toggleTag(value: string, on: boolean): void {
    setTags((prev) => (on ? [...prev, value] : prev.filter((t) => t !== value)))
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'enshrouded',
        name,
        port,
        expectedPlayers: players,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: { worldName: world, preset, roles, tags, enableTextChat: textChat }
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
            <p className="hint">Enshrouded ocupa 8,8 GB. Se descarga una vez por servidor.</p>
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

      <div className="alert warn">
        <strong>Enshrouded se anuncia siempre</strong>
        <p>
          No hay forma de crear un servidor privado: en cuanto arranca sale en la lista de
          servidores del juego con la dirección de tu casa. Lo que impide que entre cualquiera son
          las contraseñas de los roles.
        </p>
      </div>

      <div className="card">
        <h3>El servidor</h3>

        <div className="field">
          <label>Nombre</label>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <div className="help">Con el que sale en la lista de servidores del juego.</div>
        </div>

        <div className="field">
          <label>Mundo</label>
          <input
            value={worldName}
            maxLength={40}
            placeholder={name}
            onChange={(e) => setWorldName(e.target.value)}
          />
          <div className="help">
            Es el nombre de la carpeta de la partida. Después se pueden tener varios y cambiar de
            uno a otro.
          </div>
        </div>

        <div className="field">
          <label>Plazas</label>
          <input
            type="number"
            min={1}
            max={MAX_PLAYERS}
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
          />
          <div className="help">Entre 1 y {MAX_PLAYERS}, que es el máximo del juego.</div>
        </div>

        <div className="field">
          <label>Puerto</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">
            Uno solo, y por UDP. Desde el Content Update #2 Enshrouded no usa ningún otro.
          </div>
        </div>

        <div className="field">
          <label>Dificultad</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as EnshroudedPreset)}>
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === preset)?.help}</div>
        </div>
      </div>

      <div className="card">
        <h3>Roles y contraseñas</h3>
        <p className="hint">
          En Enshrouded no hay una contraseña del servidor: hay una por rol, y la que usas al entrar
          decide lo que puedes hacer dentro.
        </p>
        <RolesEditor roles={roles} onChange={setRoles} />
        {rolesProblem && (
          <div className="alert error">
            <strong>Así no arranca</strong>
            <p>{rolesProblem}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>En la lista de servidores</h3>
        <p className="hint">
          Las etiquetas ayudan a que la gente encuentre el servidor filtrando en el juego. Son las
          que admite Enshrouded: una inventada se borraría sola.
        </p>
        <div className="field">
          {TAGS.slice(0, 5).map((tag) => (
            <CheckRow
              key={tag.value}
              label={tag.label}
              checked={tags.includes(tag.value)}
              onChange={(on) => toggleTag(tag.value, on)}
            />
          ))}
        </div>

        <CheckRow
          label="Chat de texto"
          help="Viene apagado de serie en Enshrouded. Aquí se deja puesto."
          checked={textChat}
          onChange={setTextChat}
        />
      </div>

      <div className="card">
        <h3>Cómo se conectan</h3>
        <div className="field">
          <label>Desde dónde</label>
          <select
            value={connection}
            onChange={(e) => setConnection(e.target.value as ExposureMode)}
          >
            <option value="local">Solo desde mi red</option>
            <option value="router">Abriendo el puerto en el router</option>
            <option value="tunnel">Con playit.gg</option>
          </select>
          <div className="help">
            Se puede cambiar después en Configuración → Conexión, con su guía paso a paso.
          </div>
        </div>
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
              href={GAMES.enshrouded.agreements[0]!.url}
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
        <button className="primary" disabled={!canCreate} onClick={() => void create()}>
          Crear servidor ({defaultPortFor('enshrouded') === port ? 'puerto de serie' : `puerto ${port}`})
        </button>
      </div>
    </div>
  )
}
