import { useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  MIN_PASSWORD_LENGTH,
  presetInfo,
  type AllowCommands,
  type FactorioData
} from '@shared/games/factorio/types'

/**
 * Ajustes de un servidor de Factorio.
 *
 * Todo lo de aquí acaba en `server-settings.json`, que la app reescribe en cada
 * arranque: **los cambios llegan al reiniciar**, no al vuelo. Y hay dos cosas
 * que no se tocan desde aquí porque ya no se pueden cambiar —Space Age y el
 * mapa—: se grabaron dentro de la partida al generarla, y se dice.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

/** Cada cuánto puede guardar solo el servidor, en minutos. */
const AUTOSAVE_OPTIONS = [5, 10, 15, 30, 60]

export function FactorioSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // La comprobación del juego va DESPUÉS de los hooks: salir antes cambiaría
  // cuántos hooks se ejecutan según el juego, que es lo que React no permite.
  const original = manifest.game === 'factorio' ? manifest.data : null
  const [data, setData] = useState<FactorioData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />
  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    data.password.length > 0 && manifest.name.toLowerCase().includes(data.password.toLowerCase())

  function set(changes: Partial<FactorioData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, {
        data
      } as ManifestChanges)
      setNotice(
        running
          ? 'Guardado. Los cambios entran la próxima vez que arranques el servidor.'
          : 'Guardado.'
      )
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo guardar</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="alert info">{notice}</div>}

      {running && (
        <div className="alert info">
          <strong>El servidor está arrancado</strong>
          <p>
            Factorio lee sus ajustes al arrancar. Puedes cambiar lo que quieras, pero no se notará
            hasta que lo pares y lo vuelvas a arrancar.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Quién puede entrar</h3>

        <div className="field">
          <label>Contraseña del servidor</label>
          <input
            type="text"
            value={data.password}
            maxLength={40}
            placeholder="Vacío = sin contraseña"
            onChange={(e) => set({ password: e.target.value })}
          />
          <div className="help">
            La que escriben tus amigos al entrar. Se ve a propósito: es tuya y la vas a tener que
            repartir.
          </div>
          {!passwordOk && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>Demasiado corta</strong>
              <p>Hacen falta al menos {MIN_PASSWORD_LENGTH} caracteres, o ninguno.</p>
            </div>
          )}
          {passwordInName && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>La contraseña está dentro del nombre del servidor</strong>
              <p>
                El nombre lo ve cualquiera que se conecte, así que la contraseña dejaría de serlo.
                Cambia una de las dos cosas.
              </p>
            </div>
          )}
        </div>

        <div className="field">
          <label>Jugadores como mucho</label>
          <input
            type="number"
            min={1}
            max={64}
            value={data.maxPlayers}
            onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
          />
          <div className="help">
            Factorio no pone un límite propio. El de verdad lo marcan tu conexión y tu equipo,
            porque cada jugador simula la partida entera.
          </div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.verifyAccounts}
            onChange={(e) => set({ verifyAccounts: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>Comprobar con factorio.com quién entra</strong>
            <div className="help" style={{ margin: 0 }}>
              Así nadie puede entrar con el nombre de otro. A cambio, el servidor consulta a{' '}
              <code>auth.factorio.com</code> cada vez que arranca. Sin esto no sale nada hacia
              fuera, pero el nombre de cada jugador lo pone su propio juego.
            </div>
          </span>
        </label>
      </div>

      <div className="card">
        <h3>La partida</h3>

        <label className="row" style={{ cursor: 'pointer', marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={data.autoPause}
            onChange={(e) => set({ autoPause: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            <strong>Pausar cuando no queda nadie dentro</strong>
            <div className="help" style={{ margin: 0 }}>
              Es lo que hace el juego de serie: sin nadie, los enemigos no evolucionan y la fábrica
              no gasta recursos.
            </div>
          </span>
        </label>

        <div className="field">
          <label>Guardar solo cada</label>
          <select
            value={data.autosaveMinutes}
            onChange={(e) => set({ autosaveMinutes: Number(e.target.value) })}
          >
            {[...new Set([...AUTOSAVE_OPTIONS, data.autosaveMinutes])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
          </select>
          <div className="help">
            Cuanto más a menudo, menos se pierde si se va la luz. La partida se queda un instante
            clavada en cada guardado, y con una fábrica grande se nota.
          </div>
        </div>

        {advanced && (
          <div className="field">
            <label>Autoguardados que conserva el juego</label>
            <input
              type="number"
              min={1}
              max={20}
              value={data.autosaveSlots}
              onChange={(e) => set({ autosaveSlots: Number(e.target.value) })}
            />
            <div className="help">
              Se sobrescriben por turnos. Son aparte de las copias de seguridad de QubiQ y se pueden
              recuperar desde Partidas.
            </div>
          </div>
        )}
      </div>

      {advanced && (
        <div className="card">
          <h3>Comandos y descripción</h3>

          <div className="field">
            <label>Quién puede usar los comandos del juego</label>
            <select
              value={data.allowCommands}
              onChange={(e) => set({ allowCommands: e.target.value as AllowCommands })}
            >
              <option value="admins-only">Solo los administradores</option>
              <option value="true">Cualquiera</option>
              <option value="false">Nadie</option>
            </select>
            <div className="help">
              Los comandos de Factorio incluyen darse objetos y ver el mapa entero. Con
              «Cualquiera», el que entre puede usarlos.
            </div>
          </div>

          <div className="field">
            <label>Descripción</label>
            <input
              type="text"
              value={data.description}
              maxLength={200}
              onChange={(e) => set({ description: e.target.value })}
            />
            <div className="help">La ven los jugadores al conectarse.</div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Lo que ya no se puede cambiar</h3>
        <p className="hint">
          {data.spaceAge ? 'Con Space Age' : 'Sin Space Age'} · mapa «{presetInfo(data.preset).name}
          »{data.seed ? ` · semilla ${data.seed}` : ''}. Todo eso quedó grabado dentro de la partida
          al generarla: para tenerlo de otra forma hay que crear otro servidor.
        </p>
      </div>

      <div className="row">
        <button
          className="primary"
          disabled={busy || !changed || !passwordOk || passwordInName}
          onClick={() => void save()}
        >
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {changed && (
          <button disabled={busy} onClick={() => setData(original)}>
            Descartar
          </button>
        )}
      </div>
    </div>
  )
}
