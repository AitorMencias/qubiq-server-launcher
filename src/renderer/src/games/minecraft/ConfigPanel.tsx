import { useEffect, useMemo, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { PropertyDefinition } from '@shared/games/minecraft/types'
import { minecraftOf } from '@shared/games/minecraft/types'

/** Claves que se gestionan dentro de otro control y no se pintan sueltas. */
const COMPOSITE_KEYS = new Set(['hardcore'])

/**
 * Editor visual de server.properties (§8).
 *
 * El usuario no ve nunca una clave cruda: cada opción se presenta con etiqueta
 * y explicación en una frase. Lo avanzado queda detrás de un interruptor
 * apagado por defecto (§3).
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function ConfigPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const manifest = minecraftOf(state.manifest)
  const { status } = state
  const running = status !== 'stopped' && status !== 'crashed'

  const [catalog, setCatalog] = useState<PropertyDefinition[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const basic = mode === 'basic'
  const [advanced, setAdvanced] = useState(false)
  const [memoryMb, setMemoryMb] = useState(manifest.data.memoryMb)
  const [players, setPlayers] = useState(manifest.expectedPlayers ?? 8)
  const [recommendedMb, setRecommendedMb] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSaved(false)
    setMemoryMb(manifest.data.memoryMb)

    Promise.all([window.qubiq.minecraft.config.catalog(), window.qubiq.minecraft.config.get(manifest.id)])
      .then(([definitions, current]) => {
        if (cancelled) return
        setCatalog(definitions)
        setValues(current)
        setOriginal(current)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [manifest.id, manifest.data.memoryMb])

  useEffect(() => {
    let cancelled = false
    void window.qubiq.minecraft.catalog
      .recommendMemory(players, manifest.data.distribution)
      .then((value) => {
        if (cancelled) return
        setRecommendedMb(value)
        // En modo básico la memoria no es una decisión del usuario: sigue
        // siempre a la recomendación, sin control que tocar.
        if (basic) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [players, manifest.data.distribution, basic])

  // `hardcore` no se pinta por separado: va dentro del selector de modo de
  // juego, porque para el usuario es "otro modo" aunque técnicamente sean dos
  // claves distintas en server.properties.
  const visible = useMemo(
    () =>
      catalog.filter(
        (def) => (advanced && !basic ? true : def.level === 'basic') && !COMPOSITE_KEYS.has(def.key)
      ),
    [catalog, advanced, basic]
  )

  const hardcore = values['hardcore'] === 'true'

  const changedKeys = useMemo(
    () => Object.keys(values).filter((key) => values[key] !== original[key]),
    [values, original]
  )

  const destructiveChanges = useMemo(
    () =>
      changedKeys
        .map((key) => catalog.find((def) => def.key === key))
        .filter((def): def is PropertyDefinition => def?.destructive === true),
    [changedKeys, catalog]
  )

  const memoryChanged = memoryMb !== manifest.data.memoryMb
  const playersChanged = players !== (manifest.expectedPlayers ?? 8)
  const dirty = changedKeys.length > 0 || memoryChanged || playersChanged

  function update(key: string, value: string): void {
    setSaved(false)
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function save(): Promise<void> {
    if (destructiveChanges.length > 0) {
      const names = destructiveChanges.map((d) => `· ${d.label}`).join('\n')
      const ok = window.confirm(
        `Vas a cambiar opciones que afectan al mundo ya generado:\n\n${names}\n\n` +
          'El terreno existente no cambiará, pero el nuevo se generará distinto y puede ' +
          'quedar un corte visible.\n\n¿Continuar?'
      )
      if (!ok) return
    }

    setSaving(true)
    setError(null)
    try {
      if (changedKeys.length > 0) {
        // ⚠ Solo se envían las claves que el usuario ha tocado aquí.
        //
        // Mandar `values` entero reescribiría con datos viejos cualquier clave
        // que haya cambiado FUERA del panel mientras estaba abierto. El caso
        // real: un plugin mueve `level-name` al terminar una partida; si luego
        // se guarda desde aquí, vuelve a apuntar a una carpeta ya borrada y se
        // pierde el mundo en curso.
        const changes = Object.fromEntries(changedKeys.map((key) => [key, values[key]!]))
        const updated = await window.qubiq.minecraft.config.set(manifest.id, changes)
        setValues(updated)
        setOriginal(updated)
      }
      if (memoryChanged || playersChanged) {
        await window.qubiq.instances.update(manifest.id, {
          data: { memoryMb },
          expectedPlayers: players
        })
      }
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function discard(): void {
    setValues(original)
    setMemoryMb(manifest.data.memoryMb)
    setPlayers(manifest.expectedPlayers ?? 8)
    setSaved(false)
  }

  return (
    <div className="panel">
      {running && (
        <div className="alert info">
          <strong>Para el servidor para poder cambiar la configuración</strong>
          <p>
            Mientras está en marcha, el servidor mantiene estos ajustes en memoria y reescribe el
            fichero al cerrarse, así que cualquier cambio se perdería.
          </p>
        </div>
      )}

      {error && (
        <div className="alert error">
          <strong>No se pudo guardar</strong>
          <p>{error}</p>
        </div>
      )}

      {saved && !dirty && (
        <div className="alert info">
          <strong>Cambios guardados</strong>
          <p>Se aplicarán la próxima vez que arranques el servidor.</p>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h3>Ajustes del servidor</h3>
            <p className="hint" style={{ marginBottom: 0 }}>
              Lo que verán y podrán hacer tus jugadores.
            </p>
          </div>
          {/* En modo básico ni siquiera se ofrece: el interruptor sería una
              invitación a tocar cosas que no hace falta entender. */}
          {!basic && (
            <label className="row" style={{ cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mostrar avanzadas</span>
            </label>
          )}
        </div>

        {visible.map((def) =>
          def.key === 'gamemode' ? (
            <GameModeField
              key={def.key}
              definition={def}
              gamemode={values['gamemode'] ?? 'survival'}
              hardcore={hardcore}
              disabled={running}
              onChange={(mode) => {
                if (mode === 'hardcore') {
                  // Hardcore = supervivencia + la clave `hardcore`. Además el
                  // juego fuerza la dificultad a Difícil, así que la fijamos
                  // para que el fichero refleje lo que va a pasar de verdad.
                  setValues((prev) => ({
                    ...prev,
                    gamemode: 'survival',
                    hardcore: 'true',
                    difficulty: 'hard'
                  }))
                } else {
                  setValues((prev) => ({ ...prev, gamemode: mode, hardcore: 'false' }))
                }
                setSaved(false)
              }}
            />
          ) : (
            <PropertyField
              key={def.key}
              definition={def}
              value={values[def.key] ?? def.default}
              disabled={running || (def.key === 'difficulty' && hardcore)}
              lockedNote={
                def.key === 'difficulty' && hardcore
                  ? 'En modo extremo la dificultad es siempre Difícil.'
                  : undefined
              }
              onChange={(value) => update(def.key, value)}
            />
          )
        )}
      </div>

      <div className="card">
        <h3>{basic ? '¿Cuánta gente vais a ser?' : 'Jugadores y memoria'}</h3>
        <p className="hint">
          {basic
            ? 'Ajustamos solos la memoria del servidor según lo que indiques. Se aplica en el siguiente arranque.'
            : 'Se aplican en el siguiente arranque. La memoria recomendada depende de cuánta gente esperas a la vez y de si el servidor lleva mods.'}
        </p>

        <div className="field" style={basic ? { marginBottom: 0 } : undefined}>
          <label>
            {basic ? `${players} jugadores a la vez` : `Jugadores esperados a la vez: ${players}`}
          </label>
          <input
            type="range"
            min={2}
            max={50}
            step={1}
            value={players}
            disabled={running}
            onChange={(e) => {
              setSaved(false)
              setPlayers(Number(e.target.value))
            }}
          />
          <div className="help">
            {basic
              ? 'Cuenta a quienes estaréis conectados a la vez, no el total de amigos.'
              : 'Solo sirve para calcular la memoria. El límite real de conexiones es "Jugadores como máximo", ahí arriba.'}
          </div>
        </div>

        {/* La memoria es el ejemplo perfecto de decisión que el modo básico no
            debe delegar en el usuario: se aplica la recomendada y punto. */}
        {!basic && (
        <div className="field">
          <label>Memoria asignada: {(memoryMb / 1024).toFixed(1)} GB</label>
          <input
            type="range"
            min={2048}
            max={16384}
            step={512}
            value={memoryMb}
            disabled={running}
            onChange={(e) => {
              setSaved(false)
              setMemoryMb(Number(e.target.value))
            }}
          />
          <div className="help">
            {recommendedMb !== null && (
              <>
                Para {players} jugadores recomendamos {(recommendedMb / 1024).toFixed(1)} GB.{' '}
                {memoryMb !== recommendedMb && !running && (
                  <button
                    onClick={() => {
                      setSaved(false)
                      setMemoryMb(recommendedMb)
                    }}
                    style={{ padding: '2px 8px', fontSize: 11, borderRadius: 6 }}
                  >
                    Usar la recomendada
                  </button>
                )}
                <br />
              </>
            )}
            Subirla sin necesidad no mejora nada y se la quita al resto del equipo.
          </div>
        </div>
        )}
      </div>

      <div className="row between">
        <button disabled={!dirty || saving} onClick={discard}>
          Descartar cambios
        </button>
        <button className="primary" disabled={!dirty || saving || running} onClick={() => void save()}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

interface GameModeFieldProps {
  definition: PropertyDefinition
  gamemode: string
  hardcore: boolean
  disabled: boolean
  onChange: (mode: string) => void
}

/**
 * Selector de modo de juego con Hardcore como una opción más.
 *
 * ⚠ En Minecraft, hardcore NO es un valor de `gamemode`: es un booleano
 * independiente en server.properties (comprobado leyendo las claves que genera
 * un servidor real). Ponerlo en la lista de `gamemode` haría que el servidor lo
 * rechazara, así que este control lo presenta unificado pero escribe dos claves.
 */
function GameModeField({
  definition,
  gamemode,
  hardcore,
  disabled,
  onChange
}: GameModeFieldProps): React.JSX.Element {
  const value = hardcore ? 'hardcore' : gamemode

  return (
    <div className="field">
      <label>{definition.label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {definition.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value="hardcore">Extremo (hardcore)</option>
      </select>
      <div className="help">
        {value === 'hardcore'
          ? 'Supervivencia en dificultad Difícil y sin segundas oportunidades: al morir, el jugador pasa a espectador y ya no puede seguir jugando en ese mundo.'
          : definition.help}
      </div>
    </div>
  )
}

interface FieldProps {
  definition: PropertyDefinition
  value: string
  disabled: boolean
  lockedNote?: string
  onChange: (value: string) => void
}

function PropertyField({
  definition,
  value,
  disabled,
  lockedNote,
  onChange
}: FieldProps): React.JSX.Element {
  const { type, label, help, options, min, max, destructive } = definition

  if (type === 'boolean') {
    return (
      <div className="field">
        <label className="row" style={{ cursor: disabled ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={value === 'true'}
            disabled={disabled}
            onChange={(e) => onChange(String(e.target.checked))}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>{label}</span>
        </label>
        <div className="help">{help}</div>
      </div>
    )
  }

  return (
    <div className="field">
      <label>
        {label}
        {destructive && <span style={{ color: 'var(--warn)' }}> · afecta al mundo</span>}
      </label>

      {type === 'enum' && (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {type === 'number' && (
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {type === 'text' && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      <div className="help">{lockedNote ?? help}</div>
    </div>
  )
}
