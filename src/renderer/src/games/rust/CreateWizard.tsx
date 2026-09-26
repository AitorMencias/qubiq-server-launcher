import { useState } from 'react'
import type { ExposureMode } from '@shared/types'
import { GAMES, defaultPortFor } from '@shared/games'
import {
  DEFAULT_GAME_PORT,
  DEFAULT_WORLD_SIZE,
  MAX_PLAYERS,
  MAX_SEED,
  MAX_WORLD_SIZE,
  MIN_WORLD_SIZE,
  WORLD_SIZES,
  queryPortFor,
  randomSeed,
  rconPortFor,
  rustPlusPortFor,
  worldSizeInfo
} from '@shared/games/rust/types'
import { D20Loader } from '../../D20Loader'
import { CheckRow } from '../../CheckRow'
import { MemoryNotice } from './MemoryNotice'

/**
 * Asistente en modo avanzado de Rust: un formulario con todo a la vista.
 *
 * Lo que añade sobre el básico: la semilla, un tamaño de mapa cualquiera, el
 * puerto (con los otros dos que usa, que siempre van detrás), la descripción,
 * Rust+ y el plan de borrado entero. Los ajustes de la partida tienen su propia
 * pantalla, donde caben con su explicación.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState('Mi Rust')
  const [description, setDescription] = useState('')
  const [port, setPort] = useState(DEFAULT_GAME_PORT)
  const [players, setPlayers] = useState(8)
  const [worldSize, setWorldSize] = useState(DEFAULT_WORLD_SIZE)
  const [seed, setSeed] = useState(() => randomSeed())
  const [pve, setPve] = useState(false)
  const [rustPlus, setRustPlus] = useState(false)
  const [autoWipe, setAutoWipe] = useState(false)
  const [newSeed, setNewSeed] = useState(true)
  const [blueprints, setBlueprints] = useState(false)
  const [connection, setConnection] = useState<ExposureMode>('local')

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sizeOk = worldSize >= MIN_WORLD_SIZE && worldSize <= MAX_WORLD_SIZE
  const seedOk = Number.isInteger(seed) && seed >= 1 && seed <= MAX_SEED
  const canCreate = agreed && name.trim().length > 0 && sizeOk && seedOk
  const medido = worldSizeInfo(worldSize)

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'rust',
        name,
        port,
        expectedPlayers: players,
        agreements: agreed ? ['steam-subscriber'] : [],
        exposure: { mode: connection },
        options: {
          description,
          worldSize,
          seed,
          maxPlayers: players,
          rustPlus,
          settings: pve ? { 'server.pve': true } : {},
          wipe: { auto: autoWipe, newSeed, blueprints }
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
              Rust ocupa 5,5 GB. El mapa se genera la primera vez que lo arranques, no ahora.
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

      <div className="alert warn">
        <strong>Rust se anuncia siempre</strong>
        <p>
          No hay forma de crear un servidor privado: en cuanto arranca sale en la lista de
          servidores del juego con la dirección de tu casa. Cualquiera que lo encuentre puede entrar;
          quien moleste se echa y se veta desde la app.
        </p>
      </div>

      <div className="card">
        <h3>El servidor</h3>

        <div className="field">
          <label>Nombre</label>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <div className="help">Con el que sale en la lista de servidores del juego.</div>
        </div>

        <div className="field">
          <label>Descripción</label>
          <input
            value={description}
            maxLength={200}
            placeholder="Opcional: sale en la ficha del servidor dentro del juego"
            onChange={(e) => setDescription(e.target.value)}
          />
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
          <div className="help">Entre 1 y {MAX_PLAYERS}.</div>
        </div>

        <div className="field">
          <label>Puerto</label>
          <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
          <div className="help">
            El de juego, por UDP. Rust usa además los dos siguientes: el {rconPortFor(port)} (TCP) para
            que la app hable con él, solo dentro de este equipo, y el {queryPortFor(port)} (UDP) para
            la lista de Steam.
          </div>
        </div>

        <CheckRow
          label="Sin peleas entre jugadores (PvE)"
          help="Los jugadores no se pueden hacer daño entre ellos. El resto del juego, igual."
          checked={pve}
          onChange={setPve}
        />
        <CheckRow
          label="Rust+ (la app del móvil)"
          help={`Deja ver el mapa y recibir avisos de la base en el móvil. Necesita abrir un puerto TCP más (el ${rustPlusPortFor(port)}) si se usa desde fuera de casa.`}
          checked={rustPlus}
          onChange={setRustPlus}
        />
      </div>

      <div className="card">
        <h3>El mapa</h3>

        <div className="field">
          <label>Tamaño</label>
          <div className="row" style={{ gap: 10 }}>
            <select
              value={WORLD_SIZES.some((w) => w.size === worldSize) ? String(worldSize) : 'otro'}
              onChange={(e) => {
                if (e.target.value !== 'otro') setWorldSize(Number(e.target.value))
              }}
              style={{ flex: 1 }}
            >
              {WORLD_SIZES.map((w) => (
                <option key={w.size} value={w.size}>
                  {w.label} ({w.size} m)
                </option>
              ))}
              <option value="otro">Otro</option>
            </select>
            <input
              type="number"
              min={MIN_WORLD_SIZE}
              max={MAX_WORLD_SIZE}
              step={250}
              value={worldSize}
              onChange={(e) => setWorldSize(Number(e.target.value))}
              style={{ width: 120, flex: 'none' }}
            />
          </div>
          <div className="help">
            {!sizeOk
              ? `Tiene que estar entre ${MIN_WORLD_SIZE} y ${MAX_WORLD_SIZE} metros.`
              : medido
                ? `${medido.players[0]!.toUpperCase()}${medido.players.slice(1)}. Medido: unos ${medido.memoryGb.toLocaleString('es-ES')} GB de memoria y ${medido.firstStart} la primera vez.`
                : 'Cuanto más grande, más memoria y más tarda el primer arranque (unos 5 minutos con 4000).'}
          </div>
        </div>
        <MemoryNotice worldSize={sizeOk ? worldSize : DEFAULT_WORLD_SIZE} />

        <div className="field">
          <label>Semilla</label>
          <div className="row" style={{ gap: 10 }}>
            <input
              type="number"
              min={1}
              max={MAX_SEED}
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <button style={{ flex: 'none' }} onClick={() => setSeed(randomSeed())}>
              Otra al azar
            </button>
          </div>
          <div className="help">
            {seedOk
              ? 'Decide la forma del mapa: la misma semilla con el mismo tamaño da siempre el mismo terreno.'
              : `Tiene que ser un número entre 1 y ${MAX_SEED}.`}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>El borrado de cada mes</h3>
        <p className="hint">
          El primer jueves de cada mes sale una actualización de Rust que obliga a actualizar el
          servidor y empieza un mapa nuevo. Aquí decides qué hace la app cuando llega.
        </p>
        <CheckRow
          label="Hacerlo sola en cuanto salga la actualización"
          help="Guarda una copia, actualiza, borra el mapa y vuelve a arrancar. Con la app cerrada, lo hace al abrirla. Apagado, sale un aviso con un botón."
          checked={autoWipe}
          onChange={setAutoWipe}
        />
        <CheckRow
          label="Mapa con otra forma cada mes"
          help="Una semilla nueva en cada borrado. Apagado, el terreno se repite y solo se pierde lo construido."
          checked={newSeed}
          onChange={setNewSeed}
        />
        <CheckRow
          label="Borrar también los planos aprendidos"
          help="Todo el mundo vuelve a aprender a fabricar desde cero. Facepunch lo hace él mismo algunos meses."
          checked={blueprints}
          onChange={setBlueprints}
        />
      </div>

      <div className="card">
        <h3>Cómo se conectan</h3>
        <div className="field">
          <label>Desde dónde</label>
          <select value={connection} onChange={(e) => setConnection(e.target.value as ExposureMode)}>
            <option value="local">Solo desde mi red</option>
            <option value="router">Abriendo los puertos en el router</option>
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
              href={GAMES.rust.agreements[0]!.url}
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
          Crear servidor ({defaultPortFor('rust') === port ? 'puerto de serie' : `puerto ${port}`})
        </button>
      </div>
    </div>
  )
}
