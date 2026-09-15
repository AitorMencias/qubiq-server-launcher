import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { OfficialPlugin, OfficialPluginStatus } from '@shared/games/minecraft/officialPlugins'
import { officialPluginsFor } from '@shared/games/minecraft/officialPlugins'

/**
 * Plugins oficiales: los que mantenemos nosotros (§4.8).
 *
 * Aquí no hay que ir a ninguna web ni arrastrar ficheros: se instalan con un
 * botón y se configuran con un formulario, porque conocemos su config.yml.
 *
 * El caso delicado es HardcoreUtility: elegir el papel de "partida" implica
 * jugar en modo extremo, y eso cambia las reglas de la partida. Se avisa antes
 * y solo se aplica si el usuario lo acepta.
 */

interface Props {
  state: InstanceState
  onChanged: () => void
}

export function OfficialPlugins({ state, onChanged }: Props): React.JSX.Element | null {
  const { manifest, status } = state
  const running = status !== 'stopped' && status !== 'crashed'

  const plugins = officialPluginsFor(manifest.data.distribution)
  const [statuses, setStatuses] = useState<OfficialPluginStatus[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setStatuses(await window.qubiq.minecraft.official.list(manifest.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  async function run(
    action: () => Promise<OfficialPluginStatus[]>,
    message: string
  ): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setStatuses(await action())
      setNotice(message)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (plugins.length === 0) return null

  return (
    <div className="card">
      <h3>Plugins oficiales</h3>
      <p className="hint">
        Los mantenemos nosotros, así que se instalan y se configuran desde aquí sin descargar nada.
      </p>

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

      {running && (
        <div className="alert info">
          <strong>Para el servidor para instalar o configurar</strong>
          <p>
            Los plugins se cargan al arrancar, y su configuración se lee en ese momento. Con el
            servidor en marcha los cambios no tendrían efecto.
          </p>
        </div>
      )}

      {plugins.map((plugin) => (
        <OfficialPluginRow
          key={plugin.id}
          plugin={plugin}
          status={statuses.find((s) => s.id === plugin.id) ?? null}
          instanceId={manifest.id}
          running={running}
          busy={busy}
          onRun={run}
        />
      ))}
    </div>
  )
}

interface RowProps {
  plugin: OfficialPlugin
  status: OfficialPluginStatus | null
  instanceId: string
  running: boolean
  busy: boolean
  onRun: (action: () => Promise<OfficialPluginStatus[]>, message: string) => Promise<void>
}

function OfficialPluginRow({
  plugin,
  status,
  instanceId,
  running,
  busy,
  onRun
}: RowProps): React.JSX.Element {
  const [choosing, setChoosing] = useState(false)
  const [role, setRole] = useState<string>(plugin.roles?.[0]?.value ?? '')
  const [configuring, setConfiguring] = useState(false)

  const installed = status?.installed ?? false
  const chosenRole = plugin.roles?.find((r) => r.value === role)
  const currentRole = plugin.roles?.find((r) => r.value === status?.role)

  async function install(): Promise<void> {
    await onRun(
      () => window.qubiq.minecraft.official.install(instanceId, plugin.id, role || undefined),
      chosenRole?.requiresHardcore
        ? `${plugin.name} instalado, con modo extremo y los ajustes que necesita.`
        : `${plugin.name} instalado con los ajustes que necesita.`
    )
    setChoosing(false)
  }

  /**
   * Vuelve a copiar el jar que trae la aplicación y añade a la configuración
   * las opciones que el plugin haya estrenado, conservando las tuyas.
   *
   * Hace falta un botón propio porque el número de versión no siempre cambia
   * cuando el plugin sí: sin esto, quien lo instaló antes se quedaría con la
   * versión vieja y con campos en el formulario que no guardan nada.
   */
  async function update(): Promise<void> {
    await onRun(
      () => window.qubiq.minecraft.official.install(instanceId, plugin.id, status?.role ?? undefined),
      `${plugin.name} actualizado. Tu configuración se ha conservado.`
    )
  }

  async function uninstall(): Promise<void> {
    const keep = window.confirm(
      `¿Quitar ${plugin.name}?\n\n` +
        'Se conservará su configuración (la clave compartida y las direcciones) por si vuelves a ' +
        'instalarlo.\n\nAcepta para quitarlo.'
    )
    if (!keep) return
    await onRun(
      () => window.qubiq.minecraft.official.uninstall(instanceId, plugin.id, false),
      `${plugin.name} retirado. Su configuración sigue guardada.`
    )
  }

  return (
    <div className="official-plugin">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong>{plugin.name}</strong>
            <span className="official-version">v{plugin.version}</span>
            {installed && status?.enabled && <span className="badge">Instalado</span>}
            {installed && !status?.enabled && (
              <span className="badge muted">Instalado pero desactivado</span>
            )}
            {installed && status?.upToDate === false && (
              <span className="badge warn">Hay una versión nueva</span>
            )}
          </div>
          <p className="official-summary">{plugin.summary}</p>
          {installed && currentRole && (
            <p className="official-role">Papel: {currentRole.label}</p>
          )}
        </div>

        <div className="row" style={{ flexShrink: 0 }}>
          {!installed && !choosing && (
            <button className="primary" disabled={running || busy} onClick={() => setChoosing(true)}>
              Añadir
            </button>
          )}
          {installed && (
            <>
              <button disabled={running || busy} onClick={() => setConfiguring((v) => !v)}>
                {configuring ? 'Cerrar' : 'Configurar'}
              </button>
              <button
                className={status?.upToDate === false ? 'primary' : ''}
                disabled={running || busy}
                title="Vuelve a poner el plugin que trae la aplicación y añade las opciones nuevas, sin perder tu configuración."
                onClick={() => void update()}
              >
                Actualizar
              </button>
              <button className="danger" disabled={running || busy} onClick={() => void uninstall()}>
                Quitar
              </button>
            </>
          )}
        </div>
      </div>

      {!installed && choosing && (
        <div className="official-setup">
          <p className="official-description">{plugin.description}</p>
          {plugin.setupNote && <p className="note">{plugin.setupNote}</p>}

          {plugin.roles && (
            <div className="field">
              <label>¿Qué papel tiene este servidor?</label>
              <div className="role-grid">
                {plugin.roles.map((option) => (
                  <button
                    key={option.value}
                    className={`choice ${role === option.value ? 'selected' : ''}`}
                    onClick={() => setRole(option.value)}
                  >
                    <div className="title">{option.label}</div>
                    <div className="sub">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* El aviso que pediste: activar este papel cambia las reglas. */}
          {chosenRole?.requiresHardcore && (
            <div className="alert error" style={{ marginBottom: 14 }}>
              <strong>El modo de juego pasará a Extremo (hardcore)</strong>
              <p>
                Este plugin solo tiene sentido en modo extremo, así que al instalarlo lo activamos:
                la dificultad pasa a Difícil y, al morir, el jugador queda como espectador y el mundo
                se reinicia con otra semilla. Si ya tenías una partida en curso aquí, lo construido
                no se borra ahora, pero las reglas cambian en el siguiente arranque.
              </p>
            </div>
          )}

          {/* Y lo que se toca en Ajustes, dicho antes de tocarlo. */}
          {plugin.serverPropertiesNote && (
            <div className="alert" style={{ marginBottom: 14 }}>
              <strong>Ajustes del servidor que se van a cambiar</strong>
              <p>{plugin.serverPropertiesNote}</p>
            </div>
          )}

          <div className="row between">
            <button disabled={busy} onClick={() => setChoosing(false)}>
              Cancelar
            </button>
            <button className="primary" disabled={busy || !role} onClick={() => void install()}>
              {chosenRole?.requiresHardcore
                ? 'Entendido, instalar y activar modo extremo'
                : 'Instalar'}
            </button>
          </div>
        </div>
      )}

      {installed && configuring && (
        <PluginConfigForm
          plugin={plugin}
          status={status}
          instanceId={instanceId}
          busy={busy}
          onRun={onRun}
        />
      )}
    </div>
  )
}


interface ConfigFormProps {
  plugin: OfficialPlugin
  status: OfficialPluginStatus | null
  instanceId: string
  busy: boolean
  onRun: (action: () => Promise<OfficialPluginStatus[]>, message: string) => Promise<void>
}

function PluginConfigForm({
  plugin,
  status,
  instanceId,
  busy,
  onRun
}: ConfigFormProps): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(status?.config ?? {})
  const [role, setRole] = useState<string>(status?.role ?? plugin.roles?.[0]?.value ?? '')

  useEffect(() => {
    setValues(status?.config ?? {})
    setRole(status?.role ?? plugin.roles?.[0]?.value ?? '')
  }, [status, plugin.roles])

  if (!status?.hasConfig) {
    return (
      <div className="official-setup">
        <p className="hint" style={{ marginBottom: 0 }}>
          Todavía no hay configuración. Vuelve a instalar el plugin para que se cree.
        </p>
      </div>
    )
  }

  // Los campos de un papel no se enseñan en el otro: llenarían el formulario de
  // opciones que este servidor no va a usar nunca.
  const visible = plugin.fields.filter((f) => !f.onlyForRole || f.onlyForRole === role)

  // Guardar una opción que el jar instalado todavía no entiende se escribiría
  // en el fichero y no haría nada. Mejor decirlo aquí que dejar que lo
  // descubra jugando.
  const stale = status.upToDate === false

  async function save(): Promise<void> {
    const payload: Record<string, string | number | boolean> = {}
    if (plugin.roleKey) payload[plugin.roleKey] = role

    for (const field of visible) {
      const raw = values[field.path]
      if (raw === undefined) continue
      if (field.type === 'number') {
        const n = Number(raw)
        if (Number.isFinite(n)) payload[field.path] = n
      } else if (field.type === 'boolean') {
        payload[field.path] = raw === 'true'
      } else {
        payload[field.path] = raw
      }
    }

    await onRun(
      () => window.qubiq.minecraft.official.setConfig(instanceId, plugin.id, payload),
      'Configuración guardada. Se aplicará en el siguiente arranque.'
    )
  }

  return (
    <div className="official-setup">
      {stale && (
        <div className="alert" style={{ marginBottom: 14 }}>
          <strong>Este servidor tiene una versión anterior del plugin</strong>
          <p>
            Puedes configurarlo igual, pero las opciones que sean nuevas no le harán efecto hasta
            que pulses <strong>Actualizar</strong> ahí arriba. No perderás nada de lo que tengas
            configurado.
          </p>
        </div>
      )}

      {plugin.roles && (
        <div className="field">
          <label>Papel de este servidor</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {plugin.roles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="help">
            {plugin.roles.find((r) => r.value === role)?.description}
          </div>
        </div>
      )}

      {visible.map((field) => (
        <div className="field" key={field.path}>
          {field.type === 'boolean' ? (
            <>
              <label className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={values[field.path] === 'true'}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.path]: String(e.target.checked) }))
                  }
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <span>{field.label}</span>
              </label>
              <div className="help">{field.help}</div>
            </>
          ) : (
            <>
              <label>{field.label}</label>
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[field.path] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.path]: e.target.value }))
                }
              />
              <div className="help">{field.help}</div>
            </>
          )}
        </div>
      ))}

      <div className="row between">
        <span className="help" style={{ margin: 0 }}>
          Se guarda en {plugin.configFolder}/{plugin.configFileName}
        </span>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          Guardar configuración
        </button>
      </div>
    </div>
  )
}
