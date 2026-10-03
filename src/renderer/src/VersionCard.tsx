import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { InstallableVersion, UpdateCheck } from '@shared/games'
import { capabilitiesFor, versionLabel } from '@shared/games'
import { ConfirmVersionChange } from './ConfirmVersionChange'
import { D20Loader } from './D20Loader'
import { t } from './i18n'

/**
 * Versión del servidor: en cuál va, si hay una más nueva y cómo cambiarla.
 *
 * La misma tarjeta para cualquier juego, porque la pregunta es la misma aunque
 * por debajo no se parezcan en nada: en Minecraft una versión es una versión, y
 * en los juegos de Steam es una rama publicada por el estudio (§19.18).
 *
 * En básico solo se informa y, si hace falta, se pone al día de un botón: un
 * servidor de Steam desactualizado deja de aceptar a sus jugadores, así que
 * esconder eso en avanzado dejaría tirado justo a quien menos sabe arreglarlo.
 * El abanico completo —incluido volver atrás— es cosa del modo avanzado.
 */

interface Props {
  state: InstanceState
  mode: UiMode
  onRefresh: () => void
}

export function VersionCard({ state, mode, onRefresh }: Props): React.JSX.Element {
  const { manifest, status } = state
  const advanced = mode === 'advanced'
  const id = manifest.id

  const [check, setCheck] = useState<UpdateCheck | null>(null)
  const [versions, setVersions] = useState<InstallableVersion[]>([])
  const [chosen, setChosen] = useState<string>('')
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<InstallableVersion | null>(null)
  const [working, setWorking] = useState(false)

  const stopped = status === 'stopped' || status === 'crashed'
  const managed = capabilitiesFor(manifest).versions

  const load = useCallback(async (): Promise<void> => {
    if (!managed) return
    setChecking(true)
    setError(null)
    try {
      // Las dos preguntas van juntas porque la respuesta útil las mezcla: «vas
      // por detrás» solo se entiende sabiendo en qué versión vas.
      const [update, list] = await Promise.all([
        window.qubiq.instances.checkUpdate(id),
        advanced ? window.qubiq.instances.listVersions(id) : Promise.resolve([])
      ])
      setCheck(update)
      setVersions(list)
      setChosen(list.find((v) => v.installed)?.id ?? list[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }, [id, advanced, managed])

  useEffect(() => {
    void load()
  }, [load])

  // Un servidor que montó el usuario (uno a medida) no tiene «última versión»
  // que comparar: la suya la decide su modpack. Se dice cuál es y ya está.
  if (!managed) {
    return (
      <div className="card">
        <h3>{t('version.title')}</h3>
        <p className="hint">{t('version.customHint')}</p>
        <div className="row between">
          <span style={{ color: 'var(--muted)' }}>{t('version.now')}</span>
          <span>{versionLabel(manifest)}</span>
        </div>
      </div>
    )
  }

  const installed = versions.find((v) => v.installed)
  const target = versions.find((v) => v.id === chosen)
  const canChange = target !== undefined && target.installed !== true

  async function apply(version: InstallableVersion): Promise<void> {
    setWorking(true)
    setError(null)
    try {
      await window.qubiq.instances.changeVersion(id, version.id)
      await load()
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
      setConfirming(null)
    }
  }

  /**
   * Subir a la versión recomendada no pregunta nada: es lo que el juego espera
   * y no se pierde nada. Todo lo demás —bajar, meterse en una en pruebas, o no
   * poder saber cuál es más nueva— pasa por la confirmación.
   */
  function request(version: InstallableVersion): void {
    if (version.relation === 'newer' && !version.experimental) void apply(version)
    else setConfirming(version)
  }

  async function updateToLatest(): Promise<void> {
    setWorking(true)
    setError(null)
    try {
      await window.qubiq.instances.updateServer(id)
      await load()
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card">
      <h3>{t('version.title')}</h3>
      <p className="hint">{advanced ? t('version.advancedHint') : t('version.basicHint')}</p>

      <div className="row between" style={{ marginBottom: 12 }}>
        <span style={{ color: 'var(--muted)' }}>{t('version.now')}</span>
        <span>
          {versionLabel(manifest)}
          {installed && installed.label !== installed.id && ` · ${installed.label}`}
        </span>
      </div>

      {error && (
        <div className="alert error">
          <strong>{t('version.changeFailed')}</strong>
          <p>{error}</p>
        </div>
      )}

      {checking ? (
        <div className="row" style={{ gap: 10, color: 'var(--muted)' }}>
          <D20Loader size={22} />
          <span>{t('version.checking')}</span>
        </div>
      ) : (
        <UpdateLine
          check={check}
          stopped={stopped}
          working={working}
          onUpdate={() => void updateToLatest()}
          onRecheck={() => void load()}
        />
      )}

      {advanced && versions.length > 0 && (
        <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
          <label>{t('version.changeTo')}</label>
          <div className="row" style={{ gap: 10 }}>
            <select
              value={chosen}
              disabled={working || !stopped}
              onChange={(e) => setChosen(e.target.value)}
              style={{ flex: 1 }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {optionLabel(v)}
                </option>
              ))}
            </select>
            <button
              disabled={!canChange || working || !stopped}
              onClick={() => target && request(target)}
            >
              {working ? t('versionChange.changing') : t('version.change')}
            </button>
          </div>
          <div className="help">
            {!stopped
              ? t('version.stopToChange')
              : (target?.description ?? describeRelation(target))}
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmVersionChange
          state={state}
          version={confirming}
          from={installed ?? null}
          busy={working}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void apply(confirming)}
        />
      )}
    </div>
  )
}

/** Cómo se lee una versión en la lista: nombre, y qué es respecto a la de ahora. */
function optionLabel(v: InstallableVersion): string {
  const marks = [
    v.installed ? t('version.mark.installed') : null,
    v.experimental ? t('version.mark.experimental') : null,
    !v.installed && v.relation === 'older' ? t('version.mark.older') : null,
    !v.installed && v.relation === 'newer' ? t('version.mark.newer') : null
  ].filter(Boolean)
  const name = v.label === v.id ? v.label : `${v.label} (${v.id})`
  return marks.length > 0 ? `${name} — ${marks.join(', ')}` : name
}

function describeRelation(v: InstallableVersion | undefined): string {
  if (!v) return ''
  if (v.installed) return t('version.rel.installed')
  switch (v.relation) {
    case 'newer':
      return t('version.rel.newer')
    case 'older':
      return t('version.rel.older')
    case 'same':
      return t('version.rel.same')
    default:
      return t('version.rel.unknown')
  }
}

interface UpdateLineProps {
  check: UpdateCheck | null
  stopped: boolean
  working: boolean
  onUpdate: () => void
  onRecheck: () => void
}

function UpdateLine({
  check,
  stopped,
  working,
  onUpdate,
  onRecheck
}: UpdateLineProps): React.JSX.Element {
  if (check === null) {
    return (
      <div className="row between">
        <span className="hint" style={{ margin: 0 }}>
          {t('version.noUpdates')}
        </span>
        <button onClick={onRecheck}>{t('version.recheck')}</button>
      </div>
    )
  }

  if (!check.available) {
    return (
      <div className="row between">
        <span className="hint" style={{ margin: 0 }}>
          {t('version.upToDate')}
        </span>
        <button disabled={working} onClick={onRecheck}>
          {t('version.recheck')}
        </button>
      </div>
    )
  }

  return (
    <div className="alert warn">
      <strong>
        {check.latest ? t('version.newerNamed', { version: check.latest }) : t('version.newer')}
      </strong>
      <p>{stopped ? t('version.updateHint') : t('version.stopToUpdate')}</p>
      <button
        className="primary"
        style={{ marginTop: 10 }}
        disabled={working || !stopped}
        onClick={onUpdate}
      >
        {working ? t('version.updating') : t('version.update')}
      </button>
    </div>
  )
}
