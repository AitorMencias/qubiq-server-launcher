import { useCallback, useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  MAX_MEMORY_MB,
  MAX_PLAYERS,
  MEMORY_RECOMMENDED_GB,
  MIN_MEMORY_MB,
  MIN_PASSWORD_LENGTH,
  PRESETS,
  type ZomboidData
} from '@shared/games/zomboid/types'
import { ConfigTab } from './ConfigTab'

/**
 * Ajustes de un servidor de Project Zomboid.
 *
 * Son tres cosas distintas y se separan a propósito, porque se aplican en
 * momentos distintos:
 *
 * - Lo de aquí arriba vive en el manifiesto y va en la línea de órdenes o en
 *   las claves del `.ini` que lleva la app: se aplica al arrancar.
 * - Los demás ajustes del servidor son las otras 120 claves del `.ini`, y esas
 *   sí se pueden cambiar en caliente (pestaña «Servidor»).
 * - Las reglas de la partida están en su propia pestaña.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function ZomboidSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // El manifiesto es una unión por juego: hay que mirar de cuál es antes de
  // leer `data`, y la comprobación va DESPUÉS de los hooks.
  const original = manifest.game === 'zomboid' ? manifest.data : null
  const [data, setData] = useState<ZomboidData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />

  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const adminOk =
    data.adminPassword.length >= MIN_PASSWORD_LENGTH && !/["\s]/.test(data.adminPassword)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH

  function set(changes: Partial<ZomboidData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, { data } as ManifestChanges)
      setNotice(
        running
          ? 'Guardado. Estos ajustes entran la próxima vez que arranques el servidor.'
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
            Lo de esta pantalla se lee al arrancar: puedes cambiarlo, pero no se notará hasta que lo
            pares y lo vuelvas a arrancar. Lo que sí tiene efecto al momento son los ajustes de la
            pestaña <strong>Servidor</strong>.
          </p>
        </div>
      )}

      <div className="card">
        <h3>Quién puede entrar</h3>

        <div className="field">
          <label>Contraseña de administrador</label>
          <input
            type="text"
            value={data.adminPassword}
            maxLength={40}
            onChange={(e) => set({ adminPassword: e.target.value })}
          />
          <div className="help">
            Es la de la cuenta <code>admin</code>, con la que mandas dentro del juego. Entra con ese
            usuario y esta contraseña desde el propio Zomboid.
          </div>
          {!adminOk && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>No vale</strong>
              <p>
                Tiene que tener al menos {MIN_PASSWORD_LENGTH} caracteres y no puede llevar espacios
                ni comillas: viaja en la línea de órdenes del servidor.
              </p>
            </div>
          )}
        </div>

        <div className="field">
          <label>Contraseña del servidor</label>
          <input
            type="text"
            value={data.password}
            maxLength={40}
            placeholder="Vacío = entra cualquiera que tenga la dirección"
            onChange={(e) => set({ password: e.target.value })}
          />
          <div className="help">
            La que escriben tus amigos al añadir el servidor. No es la de su cuenta: esa se la
            inventan ellos la primera vez que entran.
          </div>
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
            value={data.maxPlayers}
            onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
          />
          <div className="help">
            El juego admite hasta 254, pero su propia configuración avisa de que por encima de{' '}
            {MAX_PLAYERS} el mapa empieza a desincronizarse.
          </div>
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.openToNewPlayers}
            onChange={(e) => set({ openToNewPlayers: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Cualquiera puede crearse su cuenta al entrar</span>
        </label>
        <div className="help">
          Es lo normal. Si lo quitas, el servidor pasa a funcionar por lista: tendrás que dar de
          alta a cada jugador desde <strong>Moderación</strong>, con su usuario y su contraseña.
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 12 }}>
          <input
            type="checkbox"
            checked={data.pvp}
            onChange={(e) => set({ pvp: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Los jugadores pueden hacerse daño entre ellos (PvP)</span>
        </label>
      </div>

      <div className="card">
        <h3>Memoria</h3>
        <div className="field">
          <label>Memoria asignada: {(data.memoryMb / 1024).toFixed(1)} GB</label>
          <input
            type="range"
            min={MIN_MEMORY_MB}
            max={MAX_MEMORY_MB}
            step={512}
            value={data.memoryMb}
            onChange={(e) => set({ memoryMb: Number(e.target.value) })}
          />
          <div className="help">
            Zomboid corre sobre Java, así que su memoria se reserva de antemano. Con {' '}
            {MEMORY_RECOMMENDED_GB} GB va sobrado para una partida de amigos; lo que la dispara es
            cuánto mapa tengáis explorado, no cuántos seáis.
          </div>
        </div>
      </div>

      {advanced && (
        <div className="card">
          <h3>Steam</h3>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={data.useSteam}
              onChange={(e) => set({ useSteam: e.target.checked })}
              style={{ width: 16, height: 16, flexShrink: 0 }}
            />
            <span>Arrancar el servidor con Steam</span>
          </label>
          <div className="alert info" style={{ marginTop: 10 }}>
            <strong>Con Steam, tu servidor sale en la lista pública</strong>
            <p>
              Lo avisa el propio juego: un servidor con Steam <strong>siempre</strong> es visible en
              el navegador de servidores de Steam, con tu dirección de internet, aunque no lo
              publiques. A cambio tienes el antitrampas VAC y la app puede preguntarle su estado.
              Sin Steam se entra igual, escribiendo la dirección a mano.
            </p>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Dificultad</h3>
        <p className="hint">
          Se eligió al crear el servidor:{' '}
          <strong>{PRESETS.find((p) => p.id === data.preset)?.name ?? data.preset}</strong>. Las
          reglas concretas están en la pestaña <strong>Partida</strong>, donde se pueden cambiar una
          a una con el servidor parado.
        </p>
      </div>

      <div className="row">
        <button
          className="primary"
          disabled={busy || !changed || !adminOk || !passwordOk}
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

/**
 * Las otras 120 claves del `servertest.ini`, con la explicación que el propio
 * servidor escribe encima de cada una.
 */
export function ZomboidServerPanel({ state }: { state: InstanceState }): React.JSX.Element {
  const id = state.manifest.id
  const running = state.status === 'running'
  const load = useCallback(() => window.qubiq.zomboid.settings.get(id), [id])
  const save = useCallback(
    (changes: Parameters<typeof window.qubiq.zomboid.settings.set>[1]) =>
      window.qubiq.zomboid.settings.set(id, changes),
    [id]
  )

  return (
    <ConfigTab
      instanceId={id}
      load={load}
      save={save}
      savedNotice={
        running
          ? 'Guardado. Con el servidor en marcha, los cambios se le mandan por su consola y ya están puestos.'
          : 'Guardado en servertest.ini.'
      }
      intro={
        <>
          Son los ajustes del servidor, tal y como están en <code>servertest.ini</code>. La
          explicación de cada uno la escribe el propio Zomboid: si el juego se actualiza y añade
          ajustes, aparecerán aquí solos.{' '}
          {running
            ? 'Con el servidor arrancado, los cambios se aplican al momento.'
            : 'Los cambios entran la próxima vez que lo arranques.'}
        </>
      }
    />
  )
}
