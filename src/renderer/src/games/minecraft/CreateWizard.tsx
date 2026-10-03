import { useEffect, useState } from 'react'
import type { Distribution, DistributionVersion } from '@shared/games/minecraft/types'
import { DISTRIBUTIONS, DISTRIBUTION_LABELS } from '@shared/games/minecraft/types'
import type { MemoryInfo } from '@shared/ipc'
import { D20Loader } from '../../D20Loader'
import { ImportWizard } from './ImportWizard'
import { Rich, formatNumber, t, unitLabel } from '../../i18n'

/**
 * Asistente de creación (§3, recorrido 1): tres pasos y a jugar.
 * Todo lo que no sea imprescindible tiene un valor por defecto sensato.
 */

interface Props {
  onCancel: () => void
  onCreated: (id: string) => void
  progress: { phase: string; progress: number | null; detail?: string } | null
}

export function CreateWizard({ onCancel, onCreated, progress }: Props): React.JSX.Element {
  const [name, setName] = useState(() => t('mc.wizard.defaultName'))
  const [distribution, setDistribution] = useState<Distribution>('paper')
  const [versions, setVersions] = useState<DistributionVersion[]>([])
  const [version, setVersion] = useState('')
  const [memory, setMemory] = useState<MemoryInfo | null>(null)
  const [memoryMb, setMemoryMb] = useState(4096)
  const [expectedPlayers, setExpectedPlayers] = useState(8)
  const [recommendedMb, setRecommendedMb] = useState<number | null>(null)
  /**
   * Mientras el usuario no toque la memoria a mano, sigue a la recomendación.
   * En cuanto la mueve, deja de moverse sola: sobrescribir una decisión
   * explícita del usuario es de las cosas que más molestan de una interfaz.
   */
  const [memoryTouched, setMemoryTouched] = useState(false)
  const [port, setPort] = useState(25565)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Ha elegido traer un servidor que ya tiene en vez de crear uno. */
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(true)

  useEffect(() => {
    void window.qubiq.minecraft.catalog.memory().then(setMemory)
  }, [])

  // La recomendación depende de cuánta gente se espera y del tipo de servidor:
  // los mods pagan un coste fijo mucho mayor que un Paper con plugins.
  useEffect(() => {
    let cancelled = false
    void window.qubiq.minecraft.catalog
      .recommendMemory(expectedPlayers, distribution)
      .then((value) => {
        if (cancelled) return
        setRecommendedMb(value)
        if (!memoryTouched) setMemoryMb(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [expectedPlayers, distribution, memoryTouched])

  useEffect(() => {
    let cancelled = false
    setLoadingVersions(true)
    setError(null)

    window.qubiq.minecraft.catalog
      .versions(distribution)
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        // Por defecto, la recomendada: la más reciente que no esté en pruebas.
        setVersion((list.find((v) => v.recommended) ?? list[0])?.minecraftVersion ?? '')
      })
      .catch((err: Error) => {
        if (!cancelled) setError(t('mc.create.catalogFailed', { error: err.message }))
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false)
      })

    return () => {
      cancelled = true
    }
  }, [distribution])

  const overMemory = memory !== null && memoryMb > memory.warningThresholdMb

  // Paper publica una versión nueva de Minecraft con builds alpha antes del
  // primer estable. Se puede instalar, pero el usuario tiene que saberlo.
  const selected = versions.find((v) => v.minecraftVersion === version)
  const experimental = selected?.experimental === true

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const manifest = await window.qubiq.instances.create({
        game: 'minecraft',
        name,
        expectedPlayers,
        port,
        agreements: eula ? ['minecraft-eula'] : [],
        options: {
          distribution,
          minecraftVersion: version,
          memoryMb,
          ...(experimental ? { allowExperimental: true } : {})
        }
      })
      onCreated(manifest.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  if (importing) {
    return (
      <ImportWizard
        mode="advanced"
        initialName={name}
        onBack={() => setImporting(false)}
        onCancel={onCancel}
        onCreated={onCreated}
        progress={progress}
      />
    )
  }

  if (busy) {
    return (
      <div className="panel">
        <div className="card loading-card">
          <D20Loader size={84} />
          <div>
            <h3>{t('wizard.preparing')}</h3>
            <p className="hint">{t('mc.create.preparingHint')}</p>
            <p style={{ margin: '10px 0 0', fontSize: 13 }}>
              {progress?.detail ?? t('panel.working')}
            </p>
            {/* Solo con un porcentaje real; sin él, el dado indica actividad. */}
            {progress?.progress != null && (
              <div className="progress">
                <div style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
            )}
            {error && (
              <div className="alert error" style={{ marginTop: 16 }}>
                <strong>{t('wizard.prepareFailed')}</strong>
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
          <strong>{t('catalog.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      <div className="card">
        <h3>1. {t('wizard.name.title')}</h3>
        <p className="hint">{t('mc.import.nameHelp')}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </div>

      <div className="card">
        <h3>{t('mc.create.type')}</h3>
        <p className="hint">{t('mc.create.typeHint')}</p>
        <div className="choice-grid">
          {DISTRIBUTIONS.map((d) => (
            <button
              key={d}
              className={`choice ${distribution === d ? 'selected' : ''}`}
              onClick={() => setDistribution(d)}
            >
              <div className="title">{DISTRIBUTION_LABELS[d].name}</div>
              <div className="sub">{DISTRIBUTION_LABELS[d].hint}</div>
            </button>
          ))}
          {/* No es un tipo más: abre otro recorrido, el de traer una carpeta. */}
          <button className="choice" onClick={() => setImporting(true)}>
            <div className="title">{t('mc.wizard.type.custom')}</div>
            <div className="sub">{t('mc.wizard.type.custom.sub')}</div>
          </button>
        </div>
      </div>

      <div className="card">
        <h3>{t('mc.create.versionAndSettings')}</h3>
        <p className="hint">{t('mc.create.versionHint')}</p>

        <div className="field">
          <label>{t('mc.wizard.summary.version')}</label>
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={loadingVersions}
          >
            {loadingVersions && <option>{t('mc.create.loadingVersions')}</option>}
            {versions.map((v) => (
              <option key={v.minecraftVersion} value={v.minecraftVersion}>
                {v.minecraftVersion}
                {v.experimental ? `  ${t('mc.wizard.summary.testing')}` : ''}
                {v.recommended ? `  ${t('mc.create.latestStable')}` : ''}
              </option>
            ))}
          </select>
        </div>

        {experimental && (
          <div className="alert warn">
            <strong>{t('mc.create.testingTitle', { version })}</strong>
            <p>{t('mc.create.testingText', { version })}</p>
          </div>
        )}

        <div className="field">
          <label>{t('mc.import.players', { count: expectedPlayers })}</label>
          <input
            type="range"
            min={2}
            max={50}
            step={1}
            value={expectedPlayers}
            onChange={(e) => setExpectedPlayers(Number(e.target.value))}
          />
          <div className="help">{t('mc.create.playersHelp')}</div>
        </div>

        <div className="field">
          <label>
            {t('mc.memory.label', { gb: gbText(memoryMb) })}
            {!memoryTouched && recommendedMb !== null && (
              <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                {' '}
                · {t('mc.create.recommended')}
              </span>
            )}
          </label>
          <input
            type="range"
            min={2048}
            max={memory ? Math.max(4096, memory.totalMb - 2048) : 8192}
            step={512}
            value={memoryMb}
            onChange={(e) => {
              setMemoryTouched(true)
              setMemoryMb(Number(e.target.value))
            }}
          />
          <div className="help">
            {overMemory ? (
              t('mc.memory.over')
            ) : (
              <>
                {t('mc.create.memoryAdvice', {
                  count: expectedPlayers,
                  type: DISTRIBUTION_LABELS[distribution].name,
                  gb: recommendedMb !== null ? `${gbText(recommendedMb)} ${unitLabel('GB')}` : '...',
                  total: memory ? Math.round(memory.totalMb / 1024) : '?'
                })}
                {memoryTouched && recommendedMb !== null && memoryMb !== recommendedMb && (
                  <>
                    {' '}
                    <button
                      onClick={() => {
                        setMemoryTouched(false)
                        setMemoryMb(recommendedMb)
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 6,
                        marginTop: 4
                      }}
                    >
                      {t('mc.create.backToRecommended')}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="field">
          <label>{t('help.router.port')}</label>
          <input
            type="number"
            value={port}
            min={1024}
            max={65535}
            onChange={(e) => setPort(Number(e.target.value))}
          />
          <div className="help">{t('mc.import.portDefault')}</div>
        </div>
      </div>

      <div className="card">
        <h3>{t('mc.wizard.eula.title')}</h3>
        <p className="hint">{t('mc.wizard.eula.hint')}</p>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={eula}
            onChange={(e) => setEula(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span>
            <Rich
              k="mc.wizard.eula.accept"
              values={{
                link: (
                  <a
                    href="https://aka.ms/MinecraftEULA"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)' }}
                  >
                    {t('mc.wizard.eula.link')}
                  </a>
                )
              }}
            />
          </span>
        </label>
      </div>

      <div className="row between">
        <button onClick={onCancel}>{t('common.cancel')}</button>
        <button
          className="primary"
          disabled={!eula || !version || loadingVersions || name.trim().length === 0}
          onClick={() => void create()}
        >
          {t('wizard.create')}
        </button>
      </div>
    </div>
  )
}

/** Megas a gigas con un decimal y el separador del idioma. */
function gbText(mb: number): string {
  return formatNumber(mb / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
