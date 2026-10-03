import { useCallback, useEffect, useState } from 'react'
import type { InstanceState } from '@shared/types'
import type { OfficialPlugin, OfficialPluginStatus } from '@shared/games/minecraft/officialPlugins'
import { officialPluginsFor } from '@shared/games/minecraft/officialPlugins'
import { minecraftOf } from '@shared/games/minecraft/types'
import { FloatingWindow } from '../../FloatingWindow'
import { Rich, t } from '../../i18n'

/**
 * Plugins oficiales: los que mantenemos nosotros (§4.8).
 *
 * Aquí no hay que ir a ninguna web ni arrastrar ficheros: se instalan con un
 * botón y se configuran con un formulario, porque conocemos su config.yml. El
 * formulario se abre en una ventana flotante, igual que la configuración de los
 * plugins y mods que pone el usuario (§19.20).
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
  const manifest = minecraftOf(state.manifest)
  const { status } = state
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

  /** Devuelve el error, o null si ha ido bien, para que la ventana de configuración lo enseñe. */
  async function run(
    action: () => Promise<OfficialPluginStatus[]>,
    message: string
  ): Promise<string | null> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setStatuses(await action())
      setNotice(message)
      onChanged()
      return null
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      setError(text)
      return text
    } finally {
      setBusy(false)
    }
  }

  if (plugins.length === 0) return null

  return (
    <div className="card">
      <h3>{t('mc.official.title')}</h3>
      <p className="hint">{t('mc.official.hint')}</p>

      {error && (
        <div className="alert error">
          <strong>{t('backup.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      {notice && !error && (
        <div className="alert info">
          <strong>{t('backup.done')}</strong>
          <p>{notice}</p>
        </div>
      )}

      {running && (
        <div className="alert info">
          <strong>{t('mc.official.stopFirst')}</strong>
          <p>{t('mc.official.stopFirstText')}</p>
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
  onRun: (action: () => Promise<OfficialPluginStatus[]>, message: string) => Promise<string | null>
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
        ? t('mc.official.installedHardcore', { name: plugin.name })
        : t('mc.official.installed', { name: plugin.name })
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
      t('mc.official.updated', { name: plugin.name })
    )
  }

  async function uninstall(): Promise<void> {
    const keep = window.confirm(t('mc.official.confirmRemove', { name: plugin.name }))
    if (!keep) return
    await onRun(
      () => window.qubiq.minecraft.official.uninstall(instanceId, plugin.id, false),
      t('mc.official.removed', { name: plugin.name })
    )
  }

  return (
    <div className="official-plugin">
      <div className="row between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong>{plugin.name}</strong>
            <span className="official-version">v{plugin.version}</span>
            {installed && status?.enabled && <span className="badge">{t('catalog.installed')}</span>}
            {installed && !status?.enabled && (
              <span className="badge muted">{t('mc.official.installedDisabled')}</span>
            )}
            {installed && status?.upToDate === false && (
              <span className="badge warn">{t('version.newer')}</span>
            )}
          </div>
          <p className="official-summary">{plugin.summary}</p>
          {installed && currentRole && (
            <p className="official-role">{t('mc.official.role', { role: currentRole.label })}</p>
          )}
        </div>

        <div className="row" style={{ flexShrink: 0 }}>
          {!installed && !choosing && (
            <button className="primary" disabled={running || busy} onClick={() => setChoosing(true)}>
              {t('mc.official.add')}
            </button>
          )}
          {installed && (
            <>
              <button disabled={running || busy} onClick={() => setConfiguring(true)}>
                {t('mc.content.configure')}
              </button>
              <button
                className={status?.upToDate === false ? 'primary' : ''}
                disabled={running || busy}
                title={t('mc.official.updateTitle')}
                onClick={() => void update()}
              >
                {t('version.update')}
              </button>
              <button className="danger" disabled={running || busy} onClick={() => void uninstall()}>
                {t('catalog.remove')}
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
              <label>{t('mc.official.whichRole')}</label>
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
              <strong>{t('mc.official.hardcoreTitle')}</strong>
              <p>{t('mc.official.hardcoreText')}</p>
            </div>
          )}

          {/* Y lo que se toca en Ajustes, dicho antes de tocarlo. */}
          {plugin.serverPropertiesNote && (
            <div className="alert" style={{ marginBottom: 14 }}>
              <strong>{t('mc.official.propsTitle')}</strong>
              <p>{plugin.serverPropertiesNote}</p>
            </div>
          )}

          <div className="row between">
            <button disabled={busy} onClick={() => setChoosing(false)}>
              {t('common.cancel')}
            </button>
            <button className="primary" disabled={busy || !role} onClick={() => void install()}>
              {chosenRole?.requiresHardcore ? t('mc.official.installHardcore') : t('catalog.install')}
            </button>
          </div>
        </div>
      )}

      {installed && configuring && (
        <FloatingWindow
          title={t('mc.official.configureTitle', { name: plugin.name })}
          subtitle={t('mc.official.subtitle', { version: plugin.version })}
          onClose={() => setConfiguring(false)}
        >
          <PluginConfigForm
            plugin={plugin}
            status={status}
            instanceId={instanceId}
            busy={busy}
            onRun={onRun}
            onSaved={() => setConfiguring(false)}
          />
        </FloatingWindow>
      )}
    </div>
  )
}


interface ConfigFormProps {
  plugin: OfficialPlugin
  status: OfficialPluginStatus | null
  instanceId: string
  busy: boolean
  onRun: (action: () => Promise<OfficialPluginStatus[]>, message: string) => Promise<string | null>
  /** Al guardar bien se cierra la ventana: el aviso de «Listo» queda en la tarjeta. */
  onSaved: () => void
}

function PluginConfigForm({
  plugin,
  status,
  instanceId,
  busy,
  onRun,
  onSaved
}: ConfigFormProps): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(status?.config ?? {})
  const [role, setRole] = useState<string>(status?.role ?? plugin.roles?.[0]?.value ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues(status?.config ?? {})
    setRole(status?.role ?? plugin.roles?.[0]?.value ?? '')
  }, [status, plugin.roles])

  if (!status?.hasConfig) {
    return (
      <p className="hint" style={{ marginBottom: 0 }}>
        {t('mc.official.noConfig')}
      </p>
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

    const problem = await onRun(
      () => window.qubiq.minecraft.official.setConfig(instanceId, plugin.id, payload),
      t('mc.official.configSaved')
    )
    setError(problem)
    if (problem === null) onSaved()
  }

  return (
    <div>
      {error && (
        <div className="alert error">
          <strong>{t('common.saveFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      {stale && (
        <div className="alert" style={{ marginBottom: 14 }}>
          <strong>{t('mc.official.staleTitle')}</strong>
          <p>
            <Rich k="mc.official.staleText" values={{ button: <b>{t('version.update')}</b> }} />
          </p>
        </div>
      )}

      {plugin.roles && (
        <div className="field">
          <label>{t('mc.official.roleLabel')}</label>
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
          {t('mc.official.savedIn', { path: `${plugin.configFolder}/${plugin.configFileName}` })}
        </span>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {t('mc.official.saveConfig')}
        </button>
      </div>
    </div>
  )
}
