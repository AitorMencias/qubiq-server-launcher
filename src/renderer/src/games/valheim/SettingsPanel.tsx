import { useState } from 'react'
import type { InstanceState, ManifestChanges, UiMode } from '@shared/types'
import {
  DEFAULT_SAVE_INTERVAL_SECONDS,
  GLOBAL_KEYS,
  MIN_PASSWORD_LENGTH,
  MIN_SAVE_INTERVAL_SECONDS,
  MODIFIERS,
  PRESETS,
  type ValheimData,
  type ValheimGlobalKey,
  type ValheimPreset
} from '@shared/games/valheim/types'

/**
 * Ajustes de un servidor de Valheim.
 *
 * Al revés que Satisfactory: aquí **todo se toca con el servidor parado**,
 * porque en Valheim no hay fichero de configuración ni consola. Cada ajuste es
 * un argumento de la línea de órdenes, así que se guarda en el manifiesto y se
 * aplica en el siguiente arranque. Eso se dice en pantalla, en vez de dejar que
 * el usuario cambie algo y no note nada.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onSaved: () => void
}

export function ValheimSettingsPanel({ state, mode, onSaved }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const running = status === 'running'

  // El manifiesto es una unión por juego, así que hay que mirar de cuál es
  // antes de leer `data`. La comprobación va DESPUÉS de los hooks: salir antes
  // cambiaría cuántos hooks se ejecutan según el juego, que es justo lo que
  // React no permite.
  const original = manifest.game === 'valheim' ? manifest.data : null
  const [data, setData] = useState<ValheimData | null>(original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!original || !data) return <div className="panel" />
  const changed = JSON.stringify(data) !== JSON.stringify(original)
  const passwordOk = data.password.length === 0 || data.password.length >= MIN_PASSWORD_LENGTH
  const passwordInName =
    data.password.length > 0 && manifest.name.toLowerCase().includes(data.password.toLowerCase())

  function set(changes: Partial<ValheimData>): void {
    setNotice(null)
    setData((prev) => (prev ? { ...prev, ...changes } : prev))
  }

  function toggleKey(key: ValheimGlobalKey, on: boolean): void {
    setNotice(null)
    setData((prev) =>
      prev
        ? {
            ...prev,
            globalKeys: on ? [...prev.globalKeys, key] : prev.globalKeys.filter((k) => k !== key)
          }
        : prev
    )
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.qubiq.instances.update(manifest.id, { data } as ManifestChanges)
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
            Valheim lee toda su configuración al arrancar y no la vuelve a mirar. Puedes cambiar lo
            que quieras, pero no se notará hasta que lo pares y lo vuelvas a arrancar.
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
              <p>Valheim pide al menos {MIN_PASSWORD_LENGTH} caracteres, o ninguno.</p>
            </div>
          )}
          {passwordInName && (
            <div className="alert error" style={{ marginTop: 10 }}>
              <strong>La contraseña está dentro del nombre del servidor</strong>
              <p>
                El nombre lo ve cualquiera que mire la lista de servidores, así que la contraseña
                dejaría de serlo. Cambia una de las dos cosas.
              </p>
            </div>
          )}
        </div>

        <label className="row" style={{ cursor: 'pointer', marginTop: 6 }}>
          <input
            type="checkbox"
            checked={data.listed}
            onChange={(e) => set({ listed: e.target.checked })}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          <span>Que aparezca en la lista pública de servidores de Steam</span>
        </label>
        <div className="help">
          Con esto cualquiera puede encontrar tu servidor buscándolo en Steam, y ahí sale tu
          dirección de internet. A cambio, la app puede preguntarle cuánta gente hay dentro y
          comprobar desde fuera que se llega. Sin esto, el servidor <strong>no contesta</strong> a
          esas preguntas ni desde tu propio equipo.
        </div>
      </div>

      <div className="card">
        <h3>Dificultad</h3>
        <p className="hint">
          Cambia cómo de duro es el mundo. Afecta a la partida entera, no a cada jugador.
        </p>

        <div className="field">
          <label>Preajuste</label>
          <select
            value={data.preset}
            onChange={(e) => set({ preset: e.target.value as ValheimPreset })}
          >
            {PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <div className="help">{PRESETS.find((p) => p.value === data.preset)?.help}</div>
        </div>

        {advanced &&
          MODIFIERS.map((modifier) => (
            <div className="field" key={modifier.key}>
              <label>{modifier.label}</label>
              <select
                value={data.modifiers[modifier.key] ?? 'default'}
                onChange={(e) =>
                  set({ modifiers: { ...data.modifiers, [modifier.key]: e.target.value } })
                }
              >
                {modifier.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="help">{modifier.help}</div>
            </div>
          ))}
      </div>

      {advanced && (
        <div className="card">
          <h3>Reglas del mundo</h3>
          <p className="hint">
            Son de sí o no, y se aplican a todo el mundo a la vez. Cambiarlas altera bastante la
            partida.
          </p>
          {GLOBAL_KEYS.map((rule) => (
            <label className="row" key={rule.key} style={{ cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={data.globalKeys.includes(rule.key)}
                onChange={(e) => toggleKey(rule.key, e.target.checked)}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                <strong>{rule.label}</strong>
                <div className="help" style={{ margin: 0 }}>
                  {rule.help}
                </div>
              </span>
            </label>
          ))}
        </div>
      )}

      {advanced && (
        <div className="card">
          <h3>Guardado</h3>

          <div className="field">
            <label>Guardar el mundo cada</label>
            <select
              value={data.saveIntervalSeconds}
              onChange={(e) => set({ saveIntervalSeconds: Number(e.target.value) })}
            >
              {[MIN_SAVE_INTERVAL_SECONDS, 300, 600, DEFAULT_SAVE_INTERVAL_SECONDS, 3600].map(
                (seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`}
                  </option>
                )
              )}
            </select>
            <div className="help">
              Cuanto más a menudo, menos se pierde si se va la luz. El servidor se queda un instante
              clavado en cada guardado, así que tampoco conviene pasarse.
            </div>
          </div>

          <div className="field">
            <label>Copias que guarda el propio juego</label>
            <input
              type="number"
              min={0}
              max={20}
              value={data.backups}
              onChange={(e) => set({ backups: Number(e.target.value) })}
            />
            <div className="help">
              Son las que hace Valheim por su cuenta, aparte de las de la app. No sustituyen a las
              copias de seguridad de QubiQ: están en la misma carpeta que el mundo.
            </div>
          </div>
        </div>
      )}

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
